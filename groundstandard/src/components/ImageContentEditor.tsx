import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, ArrowUp, Upload, Trash2, Image as ImageIcon, Copy, Check, ExternalLink, RefreshCw, Loader2, Link2, Calendar, HardDrive, Sparkles, X, Settings2, Save, Eye, Pencil, CheckCircle2, LayoutList, LayoutGrid, ImagePlus, Download, Clock, Folder, FolderPlus, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './datepicker-custom.css';

const N8N_BATCH_WEBHOOK = '/api/image-batch';
const BUCKET = 'image-content';
const BRAND_PROFILE_KEY = 'gs_brand_profile_v1';

/** Generate a Supabase image transform URL for thumbnails */
function thumbUrl(publicUrl: string, width: number): string {
  // Supabase public URL format: .../storage/v1/object/public/bucket/path
  // Transform URL format:       .../storage/v1/render/image/public/bucket/path?width=N
  try {
    return publicUrl.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + `?width=${width}&resize=contain`;
  } catch {
    return publicUrl;
  }
}

type ImageContentEditorProps = {
  onBackToLaunch: () => void;
};

type ImageRecord = {
  id: number;
  file_name: string;
  public_url: string;
  storage_path: string;
  status: string;
  content: string | null;
  caption: string | null;
  tags: string | null;
  comment: string | null;
  created_at: string;
  brand_profile_name: string | null;
  brand_company_name: string | null;
  folder_id: number | null;
};

type FolderRecord = {
  id: number;
  name: string;
  created_at: string;
};

type BrandProfile = {
  company_name: string;
  brand_voice: string[];
  focus_areas: string[];
  industry: string;
  location: string;
  target_audience: string;
};

type SavedBrandProfile = BrandProfile & { id: string; name: string };

const DEFAULT_BRAND_PROFILE: BrandProfile = {
  company_name: '',
  brand_voice: [],
  focus_areas: [],
  industry: '',
  location: '',
  target_audience: '',
};

function loadBrandProfile(): BrandProfile {
  try {
    const raw = localStorage.getItem(BRAND_PROFILE_KEY);
    if (raw) return { ...DEFAULT_BRAND_PROFILE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_BRAND_PROFILE };
}


export default function ImageContentEditor({ onBackToLaunch }: ImageContentEditorProps) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; done: number; current: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [generatingContent, setGeneratingContent] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchIdsRef = useRef<number[]>([]);
  const [dashboardView, setDashboardView] = useState<'gallery' | 'review' | 'schedule'>('gallery');
  const [scheduleTimeFrom, setScheduleTimeFrom] = useState<Date | null>(null);
  const [scheduleTimeTo, setScheduleTimeTo] = useState<Date | null>(null);
  const [scheduleFrequency, setScheduleFrequency] = useState<number | null>(null);
  const [scheduledPosts, setScheduledPosts] = useState<Record<number, string>>({});
  const [scheduledTimings, setScheduledTimings] = useState<Record<number, { from: string; to: string; timezone: string; every_days: number }>>({});
  const [sendingToN8n, setSendingToN8n] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [savedScheduleStatus, setSavedScheduleStatus] = useState<Record<number, 'pending' | 'sent' | 'failed'>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ content: '', caption: '', tags: '', comment: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'uploaded' | 'queued' | 'processing' | 'completed' | 'approved'>('all');
  const [gallerySearch, setGallerySearch] = useState('');
  const [selectedForExport, setSelectedForExport] = useState<Set<number>>(new Set());
  const [reviewSelectedId, setReviewSelectedId] = useState<number | null>(null);
  const [exportSchedule, setExportSchedule] = useState<Date | null>(null);
  const [exportRecycle, setExportRecycle] = useState(false);
  const [scheduleTimezone, setScheduleTimezone] = useState('');
  const prevTimezoneRef = useRef('');
  const suppressRealtimeRef = useRef<Set<number>>(new Set());
  const [selectedForGenerate, setSelectedForGenerate] = useState<Set<number>>(new Set());
  const [galleryViewMode, setGalleryViewMode] = useState<'grid' | 'list'>('grid');
  const [reviewViewMode, setReviewViewMode] = useState<'grid' | 'list'>('grid');
  const [scheduleViewMode, setScheduleViewMode] = useState<'grid' | 'list'>('grid');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'approved' | 'not_approved'>('all');
  const PAGE_SIZE = 10;

  // Folders
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [galleryFolderFilter, setGalleryFolderFilter] = useState<number | null | 'all' | 'unset'>('unset');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [movingImageId, setMovingImageId] = useState<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showBulkMoveDropdown, setShowBulkMoveDropdown] = useState(false);
  const [hideScheduled, setHideScheduled] = useState(false);

  // Brand Profile
  const [brandProfile, setBrandProfile] = useState<BrandProfile>(loadBrandProfile);
  const [showBrandProfile, setShowBrandProfile] = useState(false);
  const [brandVoiceInput, setBrandVoiceInput] = useState('');
  const [focusAreaInput, setFocusAreaInput] = useState('');
  const [brandSaved, setBrandSaved] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState<SavedBrandProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileNameWarning, setProfileNameWarning] = useState<string | null>(null);
  const [profileModalView, setProfileModalView] = useState<'picker' | 'form'>('picker');

  const fetchSavedProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('brand_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setSavedProfiles(data as SavedBrandProfile[]);
  }, []);

  const saveBrandProfile = useCallback(async () => {
    const name = profileNameInput.trim() || brandProfile.company_name || 'Unnamed Profile';
    const duplicate = savedProfiles.find(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== activeProfileId);
    if (duplicate) {
      setProfileNameWarning(`A profile named "${name}" already exists. Use a different name or load and edit the existing one.`);
      return;
    }
    setProfileNameWarning(null);
    const payload = { name, ...brandProfile };
    if (activeProfileId) {
      const { data } = await supabase
        .from('brand_profiles')
        .update(payload)
        .eq('id', activeProfileId)
        .select()
        .single();
      if (data) setSavedProfiles(prev => prev.map(p => p.id === activeProfileId ? data as SavedBrandProfile : p));
    } else {
      const { data } = await supabase
        .from('brand_profiles')
        .insert(payload)
        .select()
        .single();
      if (data) {
        setSavedProfiles(prev => [data as SavedBrandProfile, ...prev]);
        setActiveProfileId((data as SavedBrandProfile).id);
      }
    }
    localStorage.setItem(BRAND_PROFILE_KEY, JSON.stringify(brandProfile));
    setBrandSaved(true);
    setTimeout(() => setBrandSaved(false), 2000);
  }, [brandProfile, activeProfileId, profileNameInput]);

  const loadProfile = useCallback((profile: SavedBrandProfile) => {
    const { id, name, ...rest } = profile;
    setBrandProfile(rest as BrandProfile);
    setActiveProfileId(id);
    setProfileNameInput(name);
    localStorage.setItem(BRAND_PROFILE_KEY, JSON.stringify(rest));
  }, []);

  const deleteProfile = useCallback(async (id: string) => {
    await supabase.from('brand_profiles').delete().eq('id', id);
    setSavedProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) {
      setActiveProfileId(null);
      setProfileNameInput('');
    }
  }, [activeProfileId]);

  const addBrandVoice = useCallback(() => {
    const v = brandVoiceInput.trim();
    if (!v || brandProfile.brand_voice.includes(v)) return;
    setBrandProfile(prev => ({ ...prev, brand_voice: [...prev.brand_voice, v] }));
    setBrandVoiceInput('');
  }, [brandVoiceInput, brandProfile.brand_voice]);

  const removeBrandVoice = useCallback((v: string) => {
    setBrandProfile(prev => ({ ...prev, brand_voice: prev.brand_voice.filter(x => x !== v) }));
  }, []);

  const addFocusArea = useCallback(() => {
    const v = focusAreaInput.trim();
    if (!v || brandProfile.focus_areas.includes(v)) return;
    setBrandProfile(prev => ({ ...prev, focus_areas: [...prev.focus_areas, v] }));
    setFocusAreaInput('');
  }, [focusAreaInput, brandProfile.focus_areas]);

  const removeFocusArea = useCallback((v: string) => {
    setBrandProfile(prev => ({ ...prev, focus_areas: prev.focus_areas.filter(x => x !== v) }));
  }, []);

  // Fetch all images on mount
  const fetchImages = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('image_content')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setImages(data);
      if (selectedImage) {
        const updated = data.find(img => img.id === selectedImage.id);
        if (updated) setSelectedImage(updated);
      }
    }
    setLoading(false);
  }, [selectedImage]);

  const fetchScheduledPosts = useCallback(async () => {
    const { data } = await supabase.from('scheduled_posts').select('image_content_id, scheduled_at, status, time_from, time_to, timezone, every_days');
    if (!data) return;
    const posts: Record<number, string> = {};
    const statuses: Record<number, 'pending' | 'sent' | 'failed'> = {};
    const timings: Record<number, { from: string; to: string; timezone: string; every_days: number }> = {};
    data.forEach(row => {
      posts[row.image_content_id] = row.scheduled_at;
      if (row.status) statuses[row.image_content_id] = row.status;
      timings[row.image_content_id] = { from: row.time_from || '', to: row.time_to || '', timezone: row.timezone || 'UTC', every_days: row.every_days ?? 1 };
    });
    setScheduledPosts(posts);
    setSavedScheduleStatus(statuses);
    setScheduledTimings(timings);
  }, []);

  const fetchFolders = useCallback(async () => {
    const { data } = await supabase.from('folders').select('*').order('name', { ascending: true });
    if (data) setFolders(data as FolderRecord[]);
  }, []);

  const createFolder = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data } = await supabase.from('folders').insert({ name: trimmed }).select().single();
    if (data) setFolders(prev => [...prev, data as FolderRecord].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const deleteFolder = useCallback(async (id: number) => {
    await supabase.from('folders').delete().eq('id', id);
    setFolders(prev => prev.filter(f => f.id !== id));
    setImages(prev => prev.map(img => img.folder_id === id ? { ...img, folder_id: null } : img));
    if (galleryFolderFilter === id) setGalleryFolderFilter('all');
  }, [galleryFolderFilter]);

  const renameFolder = useCallback(async (id: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from('folders').update({ name: trimmed }).eq('id', id);
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: trimmed } : f).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingFolderId(null);
    setEditingFolderName('');
  }, []);

  const moveImageToFolder = useCallback(async (imageId: number, folderId: number | null) => {
    suppressRealtimeRef.current.add(imageId);
    await supabase.from('image_content').update({ folder_id: folderId }).eq('id', imageId);
    setImages(prev => prev.map(img => img.id === imageId ? { ...img, folder_id: folderId } : img));
    setMovingImageId(null);
    setTimeout(() => suppressRealtimeRef.current.delete(imageId), 3000);
  }, []);

  useEffect(() => {
    fetchImages();
    fetchSavedProfiles();
    fetchScheduledPosts();
    fetchFolders();

    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    onScroll();

    // Realtime subscription — live status updates even after page reload / tab close
    const channel = supabase
      .channel('image_content_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'image_content' }, (payload) => {
        const updated = payload.new as ImageRecord;
        if (suppressRealtimeRef.current.has(updated.id)) return;
        setSelectedImage(prev => prev && prev.id === updated.id ? updated : prev);
        setImages(prev => prev.map(i => i.id === updated.id ? updated : i));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scheduled_posts' }, (payload) => {
        const row = payload.new as { image_content_id: number; scheduled_at: string; status: string; time_from: string; time_to: string; timezone: string; every_days: number };
        setScheduledPosts(prev => ({ ...prev, [row.image_content_id]: row.scheduled_at }));
        setSavedScheduleStatus(prev => ({ ...prev, [row.image_content_id]: row.status as 'pending' | 'sent' | 'failed' }));
        setScheduledTimings(prev => ({ ...prev, [row.image_content_id]: { from: row.time_from || '', to: row.time_to || '', timezone: row.timezone || 'UTC', every_days: row.every_days ?? 1 } }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scheduled_posts' }, (payload) => {
        const row = payload.new as { image_content_id: number; scheduled_at: string; status: string; time_from: string; time_to: string; timezone: string; every_days: number };
        setScheduledPosts(prev => ({ ...prev, [row.image_content_id]: row.scheduled_at }));
        setSavedScheduleStatus(prev => ({ ...prev, [row.image_content_id]: row.status as 'pending' | 'sent' | 'failed' }));
        setScheduledTimings(prev => ({ ...prev, [row.image_content_id]: { from: row.time_from || '', to: row.time_to || '', timezone: row.timezone || 'UTC', every_days: row.every_days ?? 1 } }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'scheduled_posts' }, (payload) => {
        const id = (payload.old as { image_content_id: number }).image_content_id;
        setScheduledPosts(prev => { const next = { ...prev }; delete next[id]; return next; });
        setSavedScheduleStatus(prev => { const next = { ...prev }; delete next[id]; return next; });
        setScheduledTimings(prev => { const next = { ...prev }; delete next[id]; return next; });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); window.removeEventListener('scroll', onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount only: if there are queued/processing images, re-show progress modal
  useEffect(() => {
    if (!images.length) return;
    const inFlight = images.filter(i => i.status === 'queued' || i.status === 'processing');
    if (inFlight.length > 0 && !generateProgress && !batchGenerating) {
      // Restore original batch from localStorage to get the correct total + done count
      let batchIds = inFlight.map(i => i.id);
      try {
        const saved = localStorage.getItem('gs_active_batch');
        if (saved) {
          const savedIds: number[] = JSON.parse(saved);
          const inFlightSet = new Set(inFlight.map(i => i.id));
          const hasOverlap = savedIds.some(id => inFlightSet.has(id));
          if (hasOverlap) batchIds = savedIds;
        }
      } catch { /* ignore */ }
      batchIdsRef.current = batchIds;
      const done = batchIds.filter(id => {
        const img = images.find(i => i.id === id);
        return img && (img.status === 'completed' || img.status === 'approved');
      }).length;
      setBatchGenerating(true);
      setGenerateProgress({ total: batchIds.length, done, current: inFlight[0]?.file_name || '', failed: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length > 0]); // only run once when images first load

  // Poll DB every 3s while batch is running — reliable counter regardless of realtime
  const selectedImageRef = useRef(selectedImage);
  selectedImageRef.current = selectedImage;

  useEffect(() => {
    if (!batchGenerating) return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      const ids = batchIdsRef.current;
      if (!ids.length) return;
      const { data } = await supabase
        .from('image_content')
        .select('*')
        .in('id', ids);
      if (!data || stopped) return;
      // Count only truly finished images (completed/approved) — NOT 'uploaded' which means DB hasn't been updated to queued yet
      const finished = data.filter(i => i.status === 'completed' || i.status === 'approved');
      const done = finished.length;
      const processing = data.find(i => i.status === 'processing');
      const queued = data.find(i => i.status === 'queued');
      const current = processing?.file_name || queued?.file_name || '';
      setGenerateProgress(gp => gp ? { ...gp, done, current } : null);

      // Update local image state with latest DB data (status, caption, tags, content)
      setImages(prev => prev.map(img => {
        const updated = data.find(d => d.id === img.id);
        return updated ? updated : img;
      }));
      const sel = selectedImageRef.current;
      if (sel && ids.includes(sel.id)) {
        const updatedSelected = data.find(d => d.id === sel.id);
        if (updatedSelected) setSelectedImage(updatedSelected);
      }

      if (done >= ids.length) {
        setTimeout(() => {
          setGenerateProgress(null);
          setBatchGenerating(false);
          batchIdsRef.current = [];
          localStorage.removeItem('gs_active_batch');
        }, 5000);
      }
    };
    // Delay first poll 2s so DB has time to update status to 'queued'
    const firstPoll = setTimeout(poll, 2000);
    const interval = setInterval(poll, 3000);
    return () => { stopped = true; clearTimeout(firstPoll); clearInterval(interval); };
  }, [batchGenerating]);

  // Upload a single file — returns the new record (no state side-effects)
  const uploadFile = useCallback(async (file: File): Promise<ImageRecord | null> => {
    if (!file.type.startsWith('image/')) return null;
    try {
      const ext = file.name.split('.').pop() || 'png';
      const storagePath = `uploads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET).upload(storagePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const { data: row, error: insertError } = await supabase
        .from('image_content')
        .insert({ file_name: file.name, public_url: urlData.publicUrl, storage_path: storagePath, status: 'uploaded' })
        .select().single();
      if (insertError) throw insertError;
      return row;
    } catch (err) {
      console.error('Upload failed:', err);
      return null;
    }
  }, []);

  // Single upload — auto-selects the new image
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    const row = await uploadFile(file);
    if (row) { setImages(prev => [row, ...prev]); setSelectedImage(row); }
    else alert('Upload failed. Make sure the "image-content" bucket exists and is public.');
    setUploading(false);
  }, [uploadFile]);

  const processBatchUpload = useCallback(async (files: File[]) => {
    setUploading(true);
    setUploadProgress({ total: files.length, done: 0, current: files[0].name });
    const results: ImageRecord[] = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ total: files.length, done: i, current: files[i].name });
      const row = await uploadFile(files[i]);
      if (row) results.push(row);
    }
    setImages(prev => [...results.reverse(), ...prev]);
    setUploadProgress({ total: files.length, done: files.length, current: '' });
    setTimeout(() => { setUploadProgress(null); setUploading(false); }, 4000);
  }, [uploadFile]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.length === 1) { handleUpload(files[0]); return; }
    processBatchUpload(files);
  }, [handleUpload, processBatchUpload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (files.length === 1) { handleUpload(files[0]); return; }
    processBatchUpload(files);
  }, [handleUpload, processBatchUpload]);

  const handleDelete = useCallback((img: ImageRecord) => {
    setDeleteConfirmId(img.id);
  }, []);

  const confirmDelete = useCallback(async () => {
    const img = images.find(i => i.id === deleteConfirmId);
    if (!img) { setDeleteConfirmId(null); return; }
    await supabase.storage.from(BUCKET).remove([img.storage_path]);
    await supabase.from('image_content').delete().eq('id', img.id);
    setImages(prev => prev.filter(i => i.id !== img.id));
    if (selectedImage?.id === img.id) setSelectedImage(null);
    setDeleteConfirmId(null);
  }, [deleteConfirmId, images, selectedImage]);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ total: number; done: number } | null>(null);
  const bulkDelete = useCallback(async (ids: Set<number>) => {
    if (!ids.size) return;
    setBulkDeleting(true);
    const toDelete = images.filter(i => ids.has(i.id));
    setDeleteProgress({ total: toDelete.length, done: 0 });
    for (let i = 0; i < toDelete.length; i++) {
      setDeleteProgress({ total: toDelete.length, done: i });
      await supabase.storage.from(BUCKET).remove([toDelete[i].storage_path]);
      await supabase.from('image_content').delete().eq('id', toDelete[i].id);
    }
    setImages(prev => prev.filter(i => !ids.has(i.id)));
    setSelectedForGenerate(new Set());
    if (selectedImage && ids.has(selectedImage.id)) setSelectedImage(null);
    setDeleteProgress({ total: toDelete.length, done: toDelete.length });
    setTimeout(() => { setDeleteProgress(null); setBulkDeleting(false); }, 4000);
  }, [images, selectedImage]);

  const generateAndSave = useCallback(async (): Promise<Record<number, string>> => {
    if (!exportSchedule || !scheduleTimeFrom || !scheduleTimeTo || scheduleFrequency === null || !scheduleTimezone) return {};
    const selectedImgs = images.filter(i => selectedForExport.has(i.id));
    if (!selectedImgs.length) return {};
    const pad = (n: number) => String(n).padStart(2, '0');
    const fromMinutes = scheduleTimeFrom.getHours() * 60 + scheduleTimeFrom.getMinutes();
    const toMinutes = scheduleTimeTo.getHours() * 60 + scheduleTimeTo.getMinutes();
    const result: Record<number, string> = {};
    selectedImgs.forEach((img, index) => {
      const date = new Date(exportSchedule);
      date.setDate(date.getDate() + index * scheduleFrequency);
      const tzDate = new Intl.DateTimeFormat('en-CA', { timeZone: scheduleTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      const dateStr = tzDate; // already in yyyy-MM-dd format from en-CA locale
      const randomMinutes = fromMinutes + Math.floor(Math.random() * Math.max(1, toMinutes - fromMinutes));
      const h = Math.floor(randomMinutes / 60);
      const m = randomMinutes % 60;
      result[img.id] = `${dateStr} ${pad(h)}:${pad(m)}`;
    });
    setScheduledPosts(prev => ({ ...prev, ...result }));
    const to12h = (d: Date) => { const h = d.getHours(); const m = d.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'; return `${pad(h % 12 || 12)}:${pad(m)} ${ampm}`; };
    const timeFromStr = to12h(scheduleTimeFrom);
    const timeToStr = to12h(scheduleTimeTo);
    const newTimings: Record<number, { from: string; to: string; timezone: string; every_days: number }> = {};
    selectedImgs.forEach(img => { newTimings[img.id] = { from: timeFromStr, to: timeToStr, timezone: scheduleTimezone, every_days: scheduleFrequency! }; });
    setScheduledTimings(prev => ({ ...prev, ...newTimings }));
    setSendingToN8n(true);
    try {
      const rows = selectedImgs.map(img => ({
        image_content_id: img.id,
        scheduled_at: result[img.id],
        status: 'pending',
        time_from: timeFromStr,
        time_to: timeToStr,
        timezone: scheduleTimezone,
        every_days: scheduleFrequency,
      }));
      console.log('[generateAndSave] upserting rows:', rows);
      const { data: upsertData, error } = await supabase.from('scheduled_posts').upsert(rows, { onConflict: 'image_content_id' }).select();
      if (error) {
        console.error('[generateAndSave] upsert error:', error);
        alert(`Save failed: ${error.message}`);
        return {};
      }
      console.log('[generateAndSave] upsert success:', upsertData);
      const newStatus: Record<number, 'pending'> = {};
      selectedImgs.forEach(img => { newStatus[img.id] = 'pending'; });
      setSavedScheduleStatus(newStatus);
      setExportToast(`${selectedImgs.length} post${selectedImgs.length !== 1 ? 's' : ''} scheduled & exported successfully!`);
      setTimeout(() => setExportToast(null), 4000);
    } finally {
      setSendingToN8n(false);
    }
    return result;
  }, [exportSchedule, scheduleTimeFrom, scheduleTimeTo, scheduleFrequency, scheduleTimezone, images, selectedForExport]);

  const [bulkApproving, setBulkApproving] = useState(false);

  const bulkMoveToFolder = useCallback(async (folderId: number | null) => {
    const ids = [...selectedForGenerate];
    if (!ids.length) return;
    ids.forEach(id => suppressRealtimeRef.current.add(id));
    await supabase.from('image_content').update({ folder_id: folderId }).in('id', ids);
    setImages(prev => prev.map(i => ids.includes(i.id) ? { ...i, folder_id: folderId } : i));
    setShowBulkMoveDropdown(false);
    setTimeout(() => ids.forEach(id => suppressRealtimeRef.current.delete(id)), 5000);
  }, [selectedForGenerate]);

  const bulkApprove = useCallback(async () => {
    const ids = [...selectedForExport];
    if (!ids.length) return;
    setBulkApproving(true);
    const toApprove = ids.filter(id => images.find(i => i.id === id)?.status !== 'approved');
    if (toApprove.length) {
      toApprove.forEach(id => suppressRealtimeRef.current.add(id));
      await supabase.from('image_content').update({ status: 'approved' }).in('id', toApprove);
      setImages(prev => prev.map(i => toApprove.includes(i.id) ? { ...i, status: 'approved' } : i));
      setTimeout(() => toApprove.forEach(id => suppressRealtimeRef.current.delete(id)), 5000);
    }
    setBulkApproving(false);
  }, [selectedForExport, images]);

  const approvePost = useCallback(async (img: ImageRecord) => {
    const newStatus = img.status === 'approved' ? 'completed' : 'approved';
    await supabase.from('image_content').update({ status: newStatus }).eq('id', img.id);
    setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: newStatus } : i));
    if (selectedImage?.id === img.id) setSelectedImage(prev => prev ? { ...prev, status: newStatus } : prev);
  }, [selectedImage]);

  const startEdit = useCallback((img: ImageRecord) => {
    setEditingId(img.id);
    setEditValues({ content: img.content || '', caption: img.caption || '', tags: img.tags || '', comment: img.comment || '' });
  }, []);

  const cancelEdit = useCallback(() => { setEditingId(null); }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    setSavingEdit(true);
    await supabase.from('image_content').update(editValues).eq('id', editingId);
    setImages(prev => prev.map(i => i.id === editingId ? { ...i, ...editValues } : i));
    if (selectedImage?.id === editingId) setSelectedImage(prev => prev ? { ...prev, ...editValues } : prev);
    setSavingEdit(false);
    setEditingId(null);
  }, [editingId, editValues, selectedImage]);

  const copyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }, []);

  // Convert Supabase URL to shareable Netlify URL (shows groundstandard.netlify.app on social media)
  const toShareUrl = useCallback((publicUrl: string) => {
    const match = publicUrl.match(/\/storage\/v1\/object\/public\/image-content\/(.+)$/);
    if (match) return `https://groundstandard.netlify.app/img/${match[1]}`;
    return publicUrl;
  }, []);

  // ── Generate progress state ──
  const [generateProgress, setGenerateProgress] = useState<{ total: number; done: number; current: string; failed: number } | null>(null);

  // Send one image to n8n webhook and wait for response
  const sendToWebhook = useCallback(async (action: string, img: ImageRecord) => {
    const brandMeta = {
      status: 'processing',
      brand_profile_name: savedProfiles.find(p => p.id === activeProfileId)?.name ?? brandProfile.company_name ?? null,
      brand_company_name: brandProfile.company_name ?? null,
    };
    await supabase.from('image_content').update(brandMeta).eq('id', img.id);
    setImages(prev => prev.map(i => i.id === img.id ? { ...i, ...brandMeta } : i));
    setSelectedImage(prev => prev && prev.id === img.id ? { ...prev, ...brandMeta } : prev);

    const payload = {
      action,
      image_id: img.id,
      image_url: img.public_url,
      file_name: img.file_name,
      brand_profile: {
        company_name: brandProfile.company_name,
        brand_voice: brandProfile.brand_voice,
        focus_areas: brandProfile.focus_areas,
        industry: brandProfile.industry,
        location: brandProfile.location,
        target_audience: brandProfile.target_audience,
      },
    };

    // Use batch endpoint for single image too
    const res = await fetch(N8N_BATCH_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: [{
          image_id: img.id,
          image_url: img.public_url,
          file_name: img.file_name,
        }],
        brand_profile: payload.brand_profile,
      }),
    });

    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

    // Refresh from DB after n8n updates it
    const { data } = await supabase.from('image_content').select('*').eq('id', img.id).single();
    if (data) {
      setImages(prev => prev.map(i => i.id === img.id ? data : i));
      setSelectedImage(prev => prev && prev.id === img.id ? data : prev);
    }
  }, [brandProfile, savedProfiles, activeProfileId]);

  // ── Single image generate (with modal) ──
  const handleContentAction = useCallback(async (action: string, img: ImageRecord) => {
    setGeneratingContent(action);
    setWebhookResult(null);
    setGenerateProgress({ total: 1, done: 0, current: img.file_name, failed: 0 });
    try {
      await sendToWebhook(action, img);
      setGenerateProgress({ total: 1, done: 1, current: '', failed: 0 });
      setWebhookResult({ type: 'success', message: `"${action}" completed successfully!` });
    } catch (err) {
      console.error('Webhook error:', err);
      setGenerateProgress(null);
      setWebhookResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate' });
      await supabase.from('image_content').update({ status: 'uploaded' }).eq('id', img.id);
      setSelectedImage(prev => prev ? { ...prev, status: 'uploaded' } : prev);
      setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: 'uploaded' } : i));
    } finally {
      setGeneratingContent(null);
      setTimeout(() => setGenerateProgress(null), 4000);
    }
  }, [sendToWebhook]);

  // ── Batch generate: fire-and-forget to n8n, realtime tracks progress ──
  const handleBatchGenerate = useCallback(async (ids?: Set<number>) => {
    if (!brandProfile.company_name) return;
    const toGenerate = ids
      ? images.filter(img => ids.has(img.id) && img.status === 'uploaded')
      : images.filter(img => !img.content && img.status !== 'processing' && img.status !== 'queued');
    if (!toGenerate.length) return;
    setBatchGenerating(true);
    setGenerateProgress({ total: toGenerate.length, done: 0, current: toGenerate[0].file_name, failed: 0 });

    const queuedIds = toGenerate.map(i => i.id);
    batchIdsRef.current = queuedIds;
    localStorage.setItem('gs_active_batch', JSON.stringify(queuedIds));
    const brandMeta = {
      status: 'queued' as const,
      brand_profile_name: savedProfiles.find(p => p.id === activeProfileId)?.name ?? brandProfile.company_name ?? null,
      brand_company_name: brandProfile.company_name ?? null,
    };
    await Promise.all(queuedIds.map(id => supabase.from('image_content').update(brandMeta).eq('id', id)));
    setImages(prev => prev.map(i => queuedIds.includes(i.id) ? { ...i, ...brandMeta } : i));

    // Fire-and-forget: send images in chunks of 10 to avoid n8n timeout
    const CHUNK_SIZE = 10;
    const brandPayload = {
      company_name: brandProfile.company_name,
      brand_voice: brandProfile.brand_voice,
      focus_areas: brandProfile.focus_areas,
      industry: brandProfile.industry,
      location: brandProfile.location,
      target_audience: brandProfile.target_audience,
    };
    for (let i = 0; i < toGenerate.length; i += CHUNK_SIZE) {
      const chunk = toGenerate.slice(i, i + CHUNK_SIZE);
      try {
        await fetch(N8N_BATCH_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images: chunk.map(img => ({
              image_id: img.id,
              image_url: img.public_url,
              file_name: img.file_name,
            })),
            brand_profile: brandPayload,
          }),
        });
      } catch (err) {
        console.error(`Batch chunk ${i / CHUNK_SIZE + 1} error:`, err);
      }
    }
    // Progress is tracked via Supabase realtime — no need to wait here
    // Each chunk = separate n8n execution = fresh timeout
  }, [images, brandProfile, savedProfiles, activeProfileId]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Single action matching Bobby's task

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 text-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBackToLaunch} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all duration-200">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-md">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-gray-900">Image Content Editor</h1>
              <p className="text-xs text-gray-500">{images.length} image{images.length !== 1 ? 's' : ''} uploaded</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setProfileModalView('picker'); setShowBrandProfile(true); }} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all duration-200">
              <Settings2 className="w-4 h-4" />
              <span>Brand Profile</span>
              {activeProfileId && savedProfiles.find(p => p.id === activeProfileId) && (
                <span className="inline-flex items-center gap-1 pl-2 border-l border-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-xs font-bold text-gray-900 max-w-[120px] truncate">
                    {savedProfiles.find(p => p.id === activeProfileId)!.name}
                  </span>
                </span>
              )}
            </button>
            <button type="button" onClick={() => setShowFolderPicker(true)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all duration-200">
              <Folder className="w-4 h-4" />
              <span>Folder</span>
              {galleryFolderFilter !== 'all' && galleryFolderFilter !== 'unset' && (
                <span className="inline-flex items-center gap-1 pl-2 border-l border-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  <span className="text-xs font-bold text-gray-900 max-w-[100px] truncate">
                    {galleryFolderFilter === null ? 'Unfiled' : folders.find(f => f.id === galleryFolderFilter)?.name || 'Folder'}
                  </span>
                </span>
              )}
            </button>
            <button type="button" onClick={fetchImages} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all duration-200">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />

      {/* ── Brand Profile Modal ── */}
      {showBrandProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowBrandProfile(false); setProfileModalView('picker'); }} />
          <div className="relative bg-white w-full max-w-2xl mx-auto rounded-2xl shadow-2xl border border-gray-200 z-10 max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-6 pb-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-rose-500 rounded-xl flex items-center justify-center shadow-md">
                    <Settings2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-gray-900">Brand Profile</h3>
                    <p className="text-xs text-gray-500">
                      {profileModalView === 'picker' ? 'Select a profile to use for AI content generation' : 'This data is sent with every AI content action to n8n'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => { setShowBrandProfile(false); setProfileModalView('picker'); }} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── PICKER VIEW ── */}
            {profileModalView === 'picker' && (
              <div className="px-6 py-6 space-y-3">
                {savedProfiles.length === 0 ? (
                  <div className="text-center py-10">
                    <Settings2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500">No saved profiles yet</p>
                    <p className="text-xs text-gray-400 mt-1">Create your first brand profile to get started</p>
                  </div>
                ) : (
                  savedProfiles.map(p => (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { loadProfile(p); setShowBrandProfile(false); }}
                      onKeyDown={e => e.key === 'Enter' && (loadProfile(p), setShowBrandProfile(false))}
                      className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 text-left transition cursor-pointer ${activeProfileId === p.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50 hover:border-orange-300 hover:bg-orange-50/40'}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold text-gray-900">{p.name}</p>
                          {activeProfileId === p.id && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">Active</span>
                          )}
                        </div>
                        {p.company_name && <p className="text-xs text-gray-500 mt-0.5">{p.company_name}{p.industry ? ` · ${p.industry}` : ''}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { loadProfile(p); setProfileModalView('form'); }}
                          className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition"
                          title="Edit profile"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProfile(p.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {/* Unselect active profile */}
                {activeProfileId && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProfileId(null);
                      setProfileNameInput('');
                      setBrandProfile({ ...DEFAULT_BRAND_PROFILE });
                      localStorage.removeItem(BRAND_PROFILE_KEY);
                      setShowBrandProfile(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-red-500 border-2 border-red-200 hover:border-red-400 hover:bg-red-50 rounded-xl transition"
                  >
                    <X className="w-4 h-4" /> Unselect Active Profile
                  </button>
                )}

                {/* New Profile button */}
                <button
                  type="button"
                  onClick={() => { setBrandProfile({ ...DEFAULT_BRAND_PROFILE }); setActiveProfileId(null); setProfileNameInput(''); setProfileNameWarning(null); setProfileModalView('form'); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-orange-600 border-2 border-dashed border-orange-300 hover:border-orange-400 hover:bg-orange-50 rounded-xl transition mt-2"
                >
                  + New Profile
                </button>
              </div>
            )}

            {/* ── FORM VIEW ── */}
            {profileModalView === 'form' && (
              <>
                <div className="px-6 py-6 space-y-6">
                  {/* Back link */}
                  {savedProfiles.length > 0 && (
                    <button type="button" onClick={() => setProfileModalView('picker')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition">
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to profiles
                    </button>
                  )}

                  {/* Profile Name */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Profile Name</label>
                    <input
                      type="text"
                      value={profileNameInput}
                      onChange={e => { setProfileNameInput(e.target.value); setProfileNameWarning(null); }}
                      placeholder="e.g. Main Brand, Summer Campaign"
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 text-sm ${profileNameWarning ? 'border-red-400 focus:ring-red-500/30 focus:border-red-500' : 'border-gray-200 focus:ring-orange-500/30 focus:border-orange-500'}`}
                    />
                    {profileNameWarning && (
                      <p className="mt-1.5 text-xs font-semibold text-red-600">{profileNameWarning}</p>
                    )}
                  </div>

                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Company Name</label>
                    <input type="text" value={brandProfile.company_name} onChange={e => setBrandProfile(p => ({ ...p, company_name: e.target.value }))} placeholder="e.g. Inverted Gear Academy" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm" />
                  </div>

                  {/* Brand Voice */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Brand Voice</label>
                    <p className="text-xs text-gray-500 mb-2">Recommended for best results</p>
                    <div className="flex gap-2">
                      <input type="text" value={brandVoiceInput} onChange={e => setBrandVoiceInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addBrandVoice())} placeholder="e.g. Professional, Innovative" className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm" />
                      <button type="button" onClick={addBrandVoice} className="px-4 py-2.5 text-sm font-bold text-white bg-gray-800 hover:bg-gray-900 rounded-xl transition">Add</button>
                    </div>
                    {brandProfile.brand_voice.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {brandProfile.brand_voice.map(v => (
                          <span key={v} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                            {v}<button type="button" onClick={() => removeBrandVoice(v)} className="hover:text-blue-600 transition"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1.5">{brandProfile.brand_voice.length} brand voice{brandProfile.brand_voice.length !== 1 ? 's' : ''} added</p>
                  </div>

                  {/* Campaign Focus Areas */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Campaign Focus Areas</label>
                    <p className="text-xs text-gray-500 mb-2">This will drive your content. What do you want to promote? (e.g., services, events, seasonal offerings)</p>
                    <div className="flex gap-2">
                      <input type="text" value={focusAreaInput} onChange={e => setFocusAreaInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFocusArea())} placeholder="e.g. Martial arts programs for adults and kids" className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm" />
                      <button type="button" onClick={addFocusArea} className="px-4 py-2.5 text-sm font-bold text-white bg-gray-800 hover:bg-gray-900 rounded-xl transition">Add</button>
                    </div>
                    {brandProfile.focus_areas.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {brandProfile.focus_areas.map(v => (
                          <span key={v} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-teal-100 text-teal-800 rounded-full border border-teal-200">
                            {v}<button type="button" onClick={() => removeFocusArea(v)} className="hover:text-teal-600 transition"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1.5">{brandProfile.focus_areas.length} focus area{brandProfile.focus_areas.length !== 1 ? 's' : ''} added</p>
                  </div>

                  {/* Industry */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Industry</label>
                    <p className="text-xs text-gray-500 mb-2">Recommended for best results</p>
                    <input type="text" value={brandProfile.industry} onChange={e => setBrandProfile(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Brazilian Jiu-Jitsu Academy" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm" />
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Location</label>
                    <input type="text" value={brandProfile.location} onChange={e => setBrandProfile(p => ({ ...p, location: e.target.value }))} placeholder="e.g. 1114 W. Broad St. Bethlehem, PA 18018" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm" />
                  </div>

                  {/* Target Audience */}
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1.5">Target Audience</label>
                    <input type="text" value={brandProfile.target_audience} onChange={e => setBrandProfile(p => ({ ...p, target_audience: e.target.value }))} placeholder="e.g. People interested in training Brazilian Jiu-Jitsu" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-sm" />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between">
                  <p className="text-xs text-gray-400">Saved to database</p>
                  <button
                    type="button"
                    onClick={async () => { await saveBrandProfile(); if (!profileNameWarning) setProfileModalView('picker'); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-extrabold text-white bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 rounded-xl shadow-md transition-all duration-200"
                  >
                    {brandSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {brandSaved ? 'Saved!' : 'Save Profile'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Brand Profile Warning */}
        {!activeProfileId && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex items-center gap-3">
            <Settings2 className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Set up your Brand Profile first</p>
              <p className="text-xs text-amber-600">Content actions need your brand info (company name, voice, industry, etc.) to generate relevant content.</p>
            </div>
            <button type="button" onClick={() => { setProfileModalView('picker'); setShowBrandProfile(true); }} className="px-4 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl border border-amber-300 transition flex-shrink-0">
              Select Profile
            </button>
          </div>
        )}

        {selectedImage ? (
          /* ── Selected Image View ── */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            {/* Image Preview */}
            <div>
              <button type="button" onClick={() => { setSelectedImage(null); setWebhookResult(null); }} className="mb-4 text-sm font-semibold text-gray-500 hover:text-gray-800 transition">
                &larr; Back to gallery
              </button>
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-gray-50 flex items-center justify-center min-h-[400px] p-4">
                  <img src={selectedImage.public_url} alt={selectedImage.file_name} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
                </div>
                <div className="p-5 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-extrabold text-gray-900 truncate">{selectedImage.file_name}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      selectedImage.status === 'uploaded' ? 'bg-green-100 text-green-700 border border-green-200' :
                      selectedImage.status === 'queued' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                      selectedImage.status === 'processing' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                      selectedImage.status === 'completed' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                      selectedImage.status.includes('pending') ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                      'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}>
                      {selectedImage.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Share URL */}
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 border border-gray-200">
                    <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input type="text" readOnly value={toShareUrl(selectedImage.public_url)} className="flex-1 bg-transparent text-xs text-gray-600 outline-none truncate" />
                    <button type="button" onClick={() => copyUrl(toShareUrl(selectedImage.public_url))} className="p-1.5 hover:bg-gray-200 rounded-lg transition flex-shrink-0" title="Copy share link">
                      {copiedUrl ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                    </button>
                    <a href={toShareUrl(selectedImage.public_url)} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-gray-200 rounded-lg transition flex-shrink-0" title="Open in new tab">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                    </a>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(selectedImage.created_at)}</span>
                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {selectedImage.storage_path.split('/').pop()}</span>
                  </div>

                  {/* Webhook Result Toast */}
                  {webhookResult && (
                    <div className={`mt-4 p-3 rounded-xl border text-sm font-semibold flex items-center justify-between ${
                      webhookResult.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      <span>{webhookResult.message}</span>
                      <button type="button" onClick={() => setWebhookResult(null)} className="ml-2 p-1 hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}

                  {/* Generated content display */}
                  {selectedImage.content && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">Generated Content</div>
                        <button type="button" onClick={() => copyUrl(selectedImage.content!)} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800">Copy</button>
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedImage.content}</p>
                    </div>
                  )}
                  {selectedImage.caption && (
                    <div className="mt-3 p-4 bg-purple-50 rounded-xl border border-purple-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold text-purple-700 uppercase tracking-wider">Caption</div>
                        <button type="button" onClick={() => copyUrl(selectedImage.caption!)} className="text-[10px] font-semibold text-purple-600 hover:text-purple-800">Copy</button>
                      </div>
                      <p className="text-sm text-gray-800">{selectedImage.caption}</p>
                    </div>
                  )}
                  {selectedImage.tags && (
                    <div className="mt-3">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tags</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedImage.tags.split(',').map(tag => (
                          <span key={tag.trim()} className="px-2.5 py-1 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-lg border border-gray-200">
                            #{tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar - Content Actions */}
            <div className="space-y-4">
              {/* Brand Profile Summary */}
              {activeProfileId && brandProfile.company_name ? (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Brand</h4>
                    <button type="button" onClick={() => { setProfileModalView('picker'); setShowBrandProfile(true); }} className="text-[10px] font-semibold text-orange-600 hover:text-orange-800">Edit</button>
                  </div>
                  {activeProfileId && savedProfiles.find(p => p.id === activeProfileId) && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <p className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">{savedProfiles.find(p => p.id === activeProfileId)!.name}</p>
                    </div>
                  )}
                  <p className="text-sm font-extrabold text-gray-900">{brandProfile.company_name}</p>
                  {brandProfile.industry && <p className="text-xs text-gray-500 mt-0.5">{brandProfile.industry}</p>}
                  {brandProfile.brand_voice.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {brandProfile.brand_voice.map(v => (
                        <span key={v} className="px-2 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 rounded-md">{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <Settings2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-800">No Brand Profile selected</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">Select a brand profile to enable content generation.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setProfileModalView('picker'); setShowBrandProfile(true); }}
                    className="mt-3 w-full px-3 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl border border-amber-300 transition flex items-center justify-center gap-1.5">
                    <Settings2 className="w-3 h-3" /> Select Brand Profile
                  </button>
                </div>
              )}

              {!(selectedImage.content || selectedImage.caption) && (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                  <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-1">Generate Content</h3>
                  <p className="text-xs text-gray-500 mb-5">AI will analyze this image and create a caption with hashtags based on your brand profile</p>

                  <button
                    type="button"
                    onClick={() => handleContentAction('generate_content', selectedImage)}
                    disabled={generatingContent !== null || !activeProfileId || !brandProfile.company_name}
                    className="w-full flex items-center justify-center gap-3 px-5 py-4 text-sm font-extrabold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-2xl shadow-md shadow-purple-600/20 hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                  >
                    {generatingContent ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    {generatingContent ? 'Generating...' : 'Generate Content'}
                  </button>

                  <div className="mt-4 space-y-2 text-[11px] text-gray-500">
                    <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Caption: 2-3 sentences about the photo</p>
                    <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> 3 hashtags: company, style, location</p>
                    <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Tags: 10-15 relevant hashtags</p>
                    <p className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Tone matches your brand voice</p>
                  </div>

                  {(!activeProfileId || !brandProfile.company_name) && (
                    <p className="mt-3 text-[11px] text-amber-600 font-semibold">Select a Brand Profile to enable content generation.</p>
                  )}
                </div>
              )}

              {/* Public Preview */}
              {(selectedImage.caption || selectedImage.content) && (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                  <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider mb-3">Preview</h3>
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-extrabold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-2xl shadow-md transition-all duration-200"
                  >
                    <Eye className="w-4 h-4" />
                    Public Preview
                  </button>
                  <p className="mt-2 text-[11px] text-gray-400 text-center">See how the content looks as a published article</p>
                </div>
              )}

              {/* Danger Zone */}
              <div className="rounded-2xl border border-red-200 bg-red-50/50 shadow-sm p-5">
                <h3 className="text-sm font-extrabold text-red-700 uppercase tracking-wider mb-3">Danger Zone</h3>
                <button type="button" onClick={() => handleDelete(selectedImage)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 bg-white hover:bg-red-100 rounded-xl border border-red-300 transition-all duration-200">
                  <Trash2 className="w-4 h-4" /> Delete Image
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── Gallery / Dashboard View ── */
          <>
            {/* Hero */}
            <div className="rounded-3xl border border-gray-200/60 bg-gradient-to-r from-orange-50/80 via-white to-rose-50/80 shadow-sm p-8 sm:p-10 mb-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg flex-shrink-0">
                  <ImageIcon className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-1">Image Content Editor</h2>
                  <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
                    Upload multiple images, generate AI captions and tags, then review and approve each post before publishing.
                  </p>
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 px-6 py-3 text-sm font-extrabold text-white bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 rounded-2xl shadow-md shadow-orange-500/20 hover:shadow-lg transition-all duration-200 flex-shrink-0 disabled:opacity-50">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Upload Images'}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDashboardView('gallery')}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${dashboardView === 'gallery' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <ImageIcon className="w-4 h-4" /> Gallery
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardView('review')}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${dashboardView === 'review' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <LayoutList className="w-4 h-4" /> Review Queue
                  {galleryFolderFilter !== 'unset' && (() => {
                    const count = images.filter(i => (i.content || i.caption) && (galleryFolderFilter === 'all' || (galleryFolderFilter === null ? !i.folder_id : i.folder_id === galleryFolderFilter))).length;
                    return count > 0 ? (
                      <span className="ml-0.5 px-1.5 py-0.5 text-[9px] font-extrabold bg-orange-500 text-white rounded-full">
                        {count}
                      </span>
                    ) : null;
                  })()}
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardView('schedule')}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${dashboardView === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Calendar className="w-4 h-4" /> Schedule
                  {galleryFolderFilter !== 'unset' && (() => {
                    const scheduledInFolder = images.filter(i => scheduledPosts[i.id] && (galleryFolderFilter === 'all' || (galleryFolderFilter === null ? !i.folder_id : i.folder_id === galleryFolderFilter)));
                    return scheduledInFolder.length > 0 ? (
                      <span className="ml-0.5 px-1.5 py-0.5 text-[9px] font-extrabold bg-green-500 text-white rounded-full">
                        {scheduledInFolder.length}
                      </span>
                    ) : null;
                  })()}
                </button>
              </div>

            </div>

            {/* ── GALLERY VIEW ── */}
            {dashboardView === 'gallery' && (
              <>
                {/* Upload Drop Zone */}
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer border-2 border-dashed border-gray-300 hover:border-orange-400 rounded-3xl p-10 text-center bg-white/60 hover:bg-orange-50/40 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col items-center justify-center mb-6"
                >
                  <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-base font-extrabold text-gray-900 mb-1">Drop images here</h3>
                  <p className="text-sm text-gray-500 mb-3">or click to browse — select multiple at once</p>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    {['JPG', 'PNG', 'GIF', 'WEBP', 'SVG'].map(fmt => (
                      <span key={fmt} className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 rounded-lg border border-gray-200">{fmt}</span>
                    ))}
                  </div>
                </div>

                {galleryFolderFilter === 'unset' && !loading && images.length > 0 ? (
                  <div className="rounded-3xl border border-gray-200/60 bg-white/70 backdrop-blur-sm shadow-sm overflow-hidden p-8">
                    <div className="text-center mb-6">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center shadow-lg">
                        <FolderOpen className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-base font-extrabold text-gray-900">Select a Folder</h3>
                      <p className="text-sm text-gray-500 mt-1">Choose a folder to view your images</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                      {folders.map(f => (
                        <button key={f.id} type="button" onClick={() => setGalleryFolderFilter(f.id)}
                          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-orange-400 hover:bg-orange-50 transition-all shadow-sm hover:shadow-md">
                          <Folder className="w-7 h-7 text-orange-400" />
                          <span className="text-sm font-bold text-gray-900 truncate max-w-full">{f.name}</span>
                          <span className="text-xs text-gray-400">{images.filter(i => i.folder_id === f.id).length} images</span>
                        </button>
                      ))}
                      {/* Unfiled option */}
                      {images.some(i => !i.folder_id) && (
                        <button type="button" onClick={() => setGalleryFolderFilter(null)}
                          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-orange-400 hover:bg-orange-50 transition-all shadow-sm hover:shadow-md">
                          <Folder className="w-7 h-7 text-gray-300" />
                          <span className="text-sm font-bold text-gray-600">Unfiled</span>
                          <span className="text-xs text-gray-400">{images.filter(i => !i.folder_id).length} images</span>
                        </button>
                      )}
                    </div>
                    {folders.length === 0 && !images.some(i => !i.folder_id) && (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-400">No folders yet — use the <span className="font-bold text-gray-600">Folder</span> button to create one.</p>
                      </div>
                    )}
                    <div className="mt-6 flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 max-w-2xl mx-auto">
                      <Upload className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <p className="text-xs text-blue-600 font-semibold">You can upload images using the drop zone above — they will appear under Unfiled until you move them to a folder.</p>
                    </div>
                  </div>
                ) : loading ? (
                  <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" /><p className="text-sm text-gray-500">Loading images...</p></div>
                ) : images.length === 0 ? (
                  <div className="text-center py-12"><ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="text-sm text-gray-500 font-semibold">No images uploaded yet</p></div>
                ) : (() => {
                  const folderImages = images.filter(img =>
                    galleryFolderFilter === 'all' ? true :
                    galleryFolderFilter === 'unset' || galleryFolderFilter === null ? !img.folder_id :
                    img.folder_id === galleryFolderFilter
                  );
                  const uploadedImgs = folderImages.filter(i => i.status === 'uploaded');
                  const selectedCount = [...selectedForGenerate].filter(id => folderImages.some(i => i.id === id)).length;
                  const selectedUploaded = [...selectedForGenerate].filter(id => uploadedImgs.some(i => i.id === id));
                  const canGenerate = !!(activeProfileId && brandProfile.company_name && (galleryFilter === 'all' || galleryFilter === 'uploaded') && uploadedImgs.length > 0);
                  return (
                  <div className="rounded-3xl border border-gray-200/60 bg-white/70 backdrop-blur-sm shadow-sm overflow-hidden">
                        <>
                    <div className="px-6 sm:px-8 pt-6 pb-4 flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">Images</h3>
                        <p className="text-xs text-gray-500 mt-1">{folderImages.length} image{folderImages.length !== 1 ? 's' : ''} in your library</p>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <select
                          value={galleryFilter}
                          onChange={e => { setGalleryFilter(e.target.value as typeof galleryFilter); setGalleryPage(1); }}
                          className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-300"
                        >
                          <option value="all">All ({folderImages.length})</option>
                          <option value="uploaded">Uploaded ({folderImages.filter(i => i.status === 'uploaded').length})</option>
                          {folderImages.some(i => i.status === 'queued') && <option value="queued">Queued ({folderImages.filter(i => i.status === 'queued').length})</option>}
                          {folderImages.some(i => i.status === 'processing') && <option value="processing">Processing ({folderImages.filter(i => i.status === 'processing').length})</option>}
                          <option value="completed">Completed ({folderImages.filter(i => i.status === 'completed').length})</option>
                          <option value="approved">Approved ({folderImages.filter(i => i.status === 'approved').length})</option>
                        </select>
                        {/* Grid / List toggle */}
                        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                          <button type="button" onClick={() => setGalleryViewMode('grid')}
                            className={`p-1.5 rounded-lg transition-all ${galleryViewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                            <LayoutGrid className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => setGalleryViewMode('list')}
                            className={`p-1.5 rounded-lg transition-all ${galleryViewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                            <LayoutList className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Select All / Move / Generate toolbar row */}
                    <div className="flex items-center gap-2 flex-wrap px-6 pb-3 border-b border-gray-100">
                      <button type="button" onClick={() => {
                        if (selectedCount === folderImages.length) { setSelectedForGenerate(new Set()); }
                        else { setSelectedForGenerate(new Set(folderImages.map(i => i.id))); }
                      }} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition">
                        {selectedCount === folderImages.length && selectedCount > 0 ? 'Deselect All' : `Select All (${folderImages.length})`}
                      </button>
                      {selectedCount > 0 && <span className="text-xs text-gray-500">{selectedCount} selected</span>}
                      {selectedCount > 0 && (
                        <div className="relative">
                          <button type="button" onClick={() => setShowBulkMoveDropdown(v => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition">
                            <Folder className="w-3.5 h-3.5" /> Move to Folder
                          </button>
                          {showBulkMoveDropdown && (
                            <div className="absolute left-0 top-full mt-1 z-30 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm">
                              <button type="button" onClick={() => bulkMoveToFolder(null)}
                                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-500 font-semibold flex items-center gap-2">
                                <Folder className="w-3.5 h-3.5 text-gray-300" /> No folder
                              </button>
                              {folders.map(f => (
                                <button key={f.id} type="button" onClick={() => bulkMoveToFolder(f.id)}
                                  className="w-full text-left px-4 py-2 hover:bg-orange-50 text-gray-700 font-semibold flex items-center gap-2">
                                  <Folder className="w-3.5 h-3.5 text-orange-400" /> {f.name}
                                  <span className="ml-auto text-[10px] text-gray-400">{images.filter(i => i.folder_id === f.id).length}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1" />
                      {selectedUploaded.length > 0 && (
                        canGenerate ? (
                          <button type="button" onClick={() => { handleBatchGenerate(new Set(selectedUploaded)); setSelectedForGenerate(new Set()); }} disabled={batchGenerating}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl shadow-sm transition-all duration-200 disabled:opacity-60">
                            {batchGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {batchGenerating ? 'Generating...' : `Generate Selected (${selectedUploaded.length})`}
                          </button>
                        ) : (
                          <span className="text-xs text-amber-600 font-semibold">Select a Brand Profile first</span>
                        )
                      )}
                    </div>
                    <div className="p-6 sm:p-8 pt-4">
                      {/* Helper note — always visible */}
                      {(galleryFilter === 'all' || galleryFilter === 'uploaded') && images.some(i => i.status === 'uploaded') && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-purple-50 rounded-xl border border-purple-100">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                          <p className="text-[11px] text-purple-600 font-semibold">Check uploaded images to generate content for selected ones only, then click <span className="font-extrabold">Generate Selected</span>.</p>
                        </div>
                      )}
                      {(() => {
                        const searchLower = gallerySearch.toLowerCase().trim();
                        const filteredGallery = folderImages.filter(img =>
                          (galleryFilter === 'all' || img.status === galleryFilter) &&
                          (!searchLower || img.file_name.toLowerCase().includes(searchLower) || (img.caption || '').toLowerCase().includes(searchLower) || (img.content || '').toLowerCase().includes(searchLower) || (img.tags || '').toLowerCase().includes(searchLower))
                        );
                        const totalGalleryPages = Math.max(1, Math.ceil(filteredGallery.length / PAGE_SIZE));
                        const safePage = Math.min(galleryPage, totalGalleryPages);
                        const pagedGallery = filteredGallery.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
                        return <>
                      {/* Search + Pagination — top */}
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 gap-3">
                        <div className="flex items-center gap-2 flex-1 max-w-xs">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={gallerySearch}
                              onChange={e => { setGallerySearch(e.target.value); setGalleryPage(1); }}
                              placeholder="Search by name, caption, tags..."
                              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300 bg-white"
                            />
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                            {gallerySearch && (
                              <button type="button" onClick={() => { setGallerySearch(''); setGalleryPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {selectedForGenerate.size > 0 && (
                          <button type="button" onClick={() => setBulkDeleteConfirm(true)} disabled={bulkDeleting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all duration-200 disabled:opacity-60 flex-shrink-0">
                            {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedForGenerate.size})`}
                          </button>
                        )}
                        <p className="text-xs text-gray-500 flex-shrink-0">{filteredGallery.length} image{filteredGallery.length !== 1 ? 's' : ''}{totalGalleryPages > 1 ? ` — page ${safePage} of ${totalGalleryPages}` : ''}</p>
                        {totalGalleryPages > 1 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" disabled={safePage <= 1} onClick={() => setGalleryPage(safePage - 1)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Prev</button>
                            {Array.from({ length: totalGalleryPages }, (_, i) => i + 1)
                              .filter(p => p === 1 || p === totalGalleryPages || Math.abs(p - safePage) <= 2)
                              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('...');
                                acc.push(p);
                                return acc;
                              }, [])
                              .map((p, idx) => p === '...' ? (
                                <span key={`ellipsis-t-${idx}`} className="px-1 text-xs text-gray-400">...</span>
                              ) : (
                                <button key={p} type="button" onClick={() => setGalleryPage(p as number)}
                                  className={`w-8 h-8 text-xs font-bold rounded-lg transition ${p === safePage ? 'bg-purple-600 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-600'}`}>{p}</button>
                              ))}
                            <button type="button" disabled={safePage >= totalGalleryPages} onClick={() => setGalleryPage(safePage + 1)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next</button>
                          </div>
                        )}
                      </div>
                      {filteredGallery.length === 0 ? (
                        <div className="text-center py-12">
                          <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          {gallerySearch ? (
                            <>
                              <p className="text-sm font-semibold text-gray-500">No images found for "{gallerySearch}"</p>
                              <p className="text-xs text-gray-400 mt-1">Try a different search term or clear the filter.</p>
                              <button type="button" onClick={() => { setGallerySearch(''); setGalleryPage(1); }} className="mt-3 px-4 py-1.5 text-xs font-bold text-purple-600 border border-purple-300 rounded-xl hover:bg-purple-50 transition">Clear Search</button>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-gray-500">No images in {typeof galleryFolderFilter === 'number' ? folders.find(f => f.id === galleryFolderFilter)?.name || 'this folder' : 'Unfiled'}</p>
                              <p className="text-xs text-gray-400 mt-1">Upload images above or move existing images into this folder.</p>
                              <button type="button" onClick={() => setShowFolderPicker(true)} className="mt-3 px-4 py-1.5 text-xs font-bold text-orange-600 border border-orange-300 rounded-xl hover:bg-orange-50 transition">Change Folder</button>
                            </>
                          )}
                        </div>
                      ) : galleryViewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {pagedGallery.map(img => {
                            const isChecked = selectedForGenerate.has(img.id);
                            return (
                              <div key={img.id} className={`group relative rounded-2xl border-2 bg-white overflow-hidden shadow-sm transition-all duration-200 text-left ${isChecked ? 'border-purple-400 shadow-purple-100' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'}`}>
                                <div className="absolute top-2.5 left-2.5 z-10" onClick={e => e.stopPropagation()}>
                                  <label className="cursor-pointer">
                                    <input type="checkbox" checked={isChecked} onChange={() => setSelectedForGenerate(prev => { const next = new Set(prev); next.has(img.id) ? next.delete(img.id) : next.add(img.id); return next; })} className="sr-only" />
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${isChecked ? 'bg-purple-500 border-purple-500' : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'}`}>
                                      {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                    </div>
                                  </label>
                                </div>
                                {img.status === 'approved' && (
                                  <div className="absolute top-2 right-2 z-10">
                                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md ring-2 ring-white">
                                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                    </div>
                                  </div>
                                )}
                                <button type="button" onClick={() => setSelectedImage(img)} className="block w-full text-left">
                                  <div className="aspect-square bg-gray-100 overflow-hidden">
                                    <img src={thumbUrl(img.public_url, 300)} alt={img.file_name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { e.currentTarget.src = img.public_url; }} />
                                  </div>
                                  <div className="p-3">
                                    <p className="text-xs font-bold text-gray-900 truncate">{img.file_name}</p>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-[10px] text-gray-400">{new Date(img.created_at).toLocaleDateString()}</span>
                                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${img.status === 'approved' ? 'bg-green-100 text-green-700' : img.status === 'uploaded' ? 'bg-gray-100 text-gray-600' : img.status === 'queued' ? 'bg-purple-100 text-purple-700' : img.status === 'processing' ? 'bg-yellow-100 text-yellow-700' : img.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{img.status.replace(/_/g, ' ')}</span>
                                    </div>
                                  </div>
                                </button>
                                <div className="px-3 pb-3 flex gap-1.5" onClick={e => e.stopPropagation()}>
                                  <div className="relative flex-1">
                                    <button type="button" onClick={() => setMovingImageId(movingImageId === img.id ? null : img.id)}
                                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-bold text-orange-500 hover:bg-orange-50 border border-orange-200 rounded-lg transition">
                                      <Folder className="w-3 h-3" />
                                      {img.folder_id ? folders.find(f => f.id === img.folder_id)?.name || 'Folder' : 'Move'}
                                    </button>
                                    {movingImageId === img.id && (
                                      <div className="absolute bottom-full left-0 mb-1 z-20 w-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-xs">
                                        <button type="button" onClick={() => moveImageToFolder(img.id, null)}
                                          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-500 font-semibold">No folder</button>
                                        {folders.map(f => (
                                          <button key={f.id} type="button" onClick={() => moveImageToFolder(img.id, f.id)}
                                            className={`w-full text-left px-3 py-1.5 hover:bg-orange-50 font-semibold flex items-center gap-1.5 ${img.folder_id === f.id ? 'text-orange-600 bg-orange-50' : 'text-gray-700'}`}>
                                            <Folder className="w-3 h-3" />{f.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <button type="button" onClick={() => handleDelete(img)} className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-gray-100">
                          {/* List header */}
                          <div className="flex items-center gap-4 px-1 py-2 bg-gray-50 rounded-xl mb-1">
                            <div className="w-5 flex-shrink-0 flex items-center justify-center">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                            </div>
                            <div className="w-12 flex-shrink-0" />
                            <p className="flex-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">File Name</p>
                            <p className="w-24 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider text-right">Date</p>
                            <p className="w-20 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider text-right">Status</p>
                          </div>
                          {pagedGallery.map(img => {
                            const isChecked = selectedForGenerate.has(img.id);
                            return (
                              <div key={img.id} className={`flex items-center gap-4 py-3 transition-all ${isChecked ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                                {/* Checkbox */}
                                <div className="flex-shrink-0 pl-1" onClick={e => e.stopPropagation()}>
                                  <label className="cursor-pointer">
                                    <input type="checkbox" checked={isChecked} onChange={() => setSelectedForGenerate(prev => { const next = new Set(prev); next.has(img.id) ? next.delete(img.id) : next.add(img.id); return next; })} className="sr-only" />
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-purple-500 border-purple-500' : 'bg-white border-gray-300'}`}>
                                      {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                    </div>
                                  </label>
                                </div>
                                {/* Thumbnail */}
                                <button type="button" onClick={() => setSelectedImage(img)} className="flex items-center gap-4 flex-1 text-left min-w-0">
                                  <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                                    <img src={thumbUrl(img.public_url, 96)} alt={img.file_name} loading="lazy" className="w-full h-full object-cover" onError={e => { e.currentTarget.src = img.public_url; }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{img.file_name}</p>
                                    <p className="text-xs text-gray-400">{new Date(img.created_at).toLocaleDateString()}</p>
                                  </div>
                                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg flex-shrink-0 ${img.status === 'approved' ? 'bg-green-100 text-green-700' : img.status === 'uploaded' ? 'bg-gray-100 text-gray-600' : img.status === 'queued' ? 'bg-purple-100 text-purple-700' : img.status === 'processing' ? 'bg-yellow-100 text-yellow-700' : img.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{img.status.replace(/_/g, ' ')}</span>
                                </button>
                                {/* Folder + Delete */}
                                <div className="flex items-center gap-1 flex-shrink-0 pr-1" onClick={e => e.stopPropagation()}>
                                  <div className="relative">
                                    <button type="button" onClick={() => setMovingImageId(movingImageId === img.id ? null : img.id)}
                                      className="p-1.5 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition">
                                      <Folder className="w-4 h-4" />
                                    </button>
                                    {movingImageId === img.id && (
                                      <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-xs">
                                        <button type="button" onClick={() => moveImageToFolder(img.id, null)}
                                          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-500 font-semibold">No folder</button>
                                        {folders.map(f => (
                                          <button key={f.id} type="button" onClick={() => moveImageToFolder(img.id, f.id)}
                                            className={`w-full text-left px-3 py-1.5 hover:bg-orange-50 font-semibold flex items-center gap-1.5 ${img.folder_id === f.id ? 'text-orange-600 bg-orange-50' : 'text-gray-700'}`}>
                                            <Folder className="w-3 h-3" />{f.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <button type="button" onClick={() => handleDelete(img)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      </>;
                      })()}
                    </div>
                    </>
                    </div>
                  );
                })()}
              </>
            )}

            {/* ── REVIEW QUEUE VIEW ── */}
            {dashboardView === 'review' && (
              galleryFolderFilter === 'unset' && !loading && images.length > 0 ? (
                <div className="rounded-3xl border border-gray-200/60 bg-white/70 backdrop-blur-sm shadow-sm overflow-hidden p-8">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center shadow-lg">
                      <FolderOpen className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-base font-extrabold text-gray-900">Select a Folder</h3>
                    <p className="text-sm text-gray-500 mt-1">Choose a folder to review posts</p>
                  </div>
                  {folders.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                      {folders.map(f => (
                        <button key={f.id} type="button" onClick={() => setGalleryFolderFilter(f.id)}
                          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-orange-400 hover:bg-orange-50 transition-all shadow-sm hover:shadow-md">
                          <Folder className="w-7 h-7 text-orange-400" />
                          <span className="text-sm font-bold text-gray-900 truncate max-w-full">{f.name}</span>
                          <span className="text-xs text-gray-400">{images.filter(i => (i.content || i.caption) && i.folder_id === f.id).length} posts</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-400">No folders yet. Create one using the <span className="font-bold text-gray-600">Folder</span> button above.</p>
                    </div>
                  )}
                  <div className="mt-6 flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 max-w-2xl mx-auto">
                    <Upload className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <p className="text-xs text-blue-600 font-semibold">Upload images in the Gallery tab first, then generate content — they'll appear here for review.</p>
                  </div>
                </div>
              ) : (
              <div className="space-y-4">
                {/* Active folder indicator */}
                <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold text-gray-900">
                      {typeof galleryFolderFilter === 'number' ? folders.find(f => f.id === galleryFolderFilter)?.name || 'Folder' : galleryFolderFilter === null ? 'Unfiled' : 'All Folders'}
                    </span>
                  </div>
                  <button type="button" onClick={() => setGalleryFolderFilter('unset')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-lg transition">
                    <FolderOpen className="w-3.5 h-3.5" /> Change Folder
                  </button>
                </div>
                {(() => {
                  const allQueueImgs = images.filter(i => (i.content || i.caption) && (galleryFolderFilter === 'all' || (galleryFolderFilter === 'unset' || galleryFolderFilter === null ? !i.folder_id : i.folder_id === galleryFolderFilter)));
                  const queueImgs = hideScheduled ? allQueueImgs.filter(i => !scheduledPosts[i.id]) : allQueueImgs;
                  const folderLabel = typeof galleryFolderFilter === 'number' ? folders.find(f => f.id === galleryFolderFilter)?.name || 'this folder' : 'Unfiled';
                  if (!allQueueImgs.length) return (
                    <div className="text-center py-16 bg-white rounded-3xl border border-gray-200">
                      <LayoutList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-gray-500">No posts in {folderLabel}</p>
                      <p className="text-xs text-gray-400 mt-1">Generate content for images in this folder first, then review them here.</p>
                      <button type="button" onClick={() => setDashboardView('gallery')} className="mt-4 px-4 py-2 text-xs font-bold text-orange-600 border border-orange-300 rounded-xl hover:bg-orange-50 transition">Go to Gallery</button>
                    </div>
                  );
                  const allSelected = queueImgs.length > 0 && queueImgs.every(i => selectedForExport.has(i.id));
                  const exportable = queueImgs.filter(i => selectedForExport.has(i.id));
                  return (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Row 1: Select All + count + Grid/List */}
                      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => allSelected ? setSelectedForExport(new Set()) : setSelectedForExport(new Set(queueImgs.map(i => i.id)))}
                              className="w-4 h-4 accent-orange-500 cursor-pointer"
                            />
                            <span className="text-sm font-bold text-gray-800">
                              {allSelected ? 'Deselect All' : 'Select All'} ({queueImgs.length})
                            </span>
                            {exportable.length > 0 && (
                              <span className="px-2 py-0.5 text-[11px] font-bold bg-orange-100 text-orange-600 rounded-full">{exportable.length} selected</span>
                            )}
                          </label>
                          {exportable.length > 0 && (() => {
                            const toApproveCount = exportable.filter(i => i.status !== 'approved').length;
                            const alreadyApprovedCount = exportable.filter(i => i.status === 'approved').length;
                            return (
                              <div className="flex items-center gap-2">
                                {alreadyApprovedCount > 0 && (
                                  <span className="text-xs text-gray-400">
                                    <span className="font-semibold text-green-600">{alreadyApprovedCount}</span> already approved
                                  </span>
                                )}
                                {toApproveCount > 0 && (
                                  <button
                                    type="button"
                                    disabled={bulkApproving}
                                    onClick={bulkApprove}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {bulkApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {bulkApproving ? 'Approving...' : `Approve ${toApproveCount} Post${toApproveCount !== 1 ? 's' : ''}`}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setHideScheduled(h => !h)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${hideScheduled ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-500'}`}>
                            <Calendar className="w-3.5 h-3.5" />
                            {hideScheduled ? 'Showing Unscheduled' : 'Hide Scheduled'}
                            {hideScheduled && <span className="ml-0.5 text-[9px] font-extrabold bg-white/30 text-white px-1.5 py-0.5 rounded-full">{allQueueImgs.filter(i => scheduledPosts[i.id]).length} hidden</span>}
                          </button>
                          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                            <button type="button" onClick={() => setReviewViewMode('grid')}
                              className={`p-1.5 rounded-lg transition-all ${reviewViewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                              <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setReviewViewMode('list')}
                              className={`p-1.5 rounded-lg transition-all ${reviewViewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                              <LayoutList className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Row 2: Schedule config + Export */}
                      <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
                        {/* Date */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wider">Date <span className="text-red-400">*</span></span>
                          <div className={`flex items-center gap-1 bg-white border-2 rounded-xl px-3 py-1.5 shadow-sm transition ${exportSchedule ? 'border-orange-300' : 'border-red-200'}`}>
                            <Calendar className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                            <DatePicker
                              selected={exportSchedule}
                              onChange={(date: Date | null) => setExportSchedule(date)}
                              dateFormat="MMM d, yyyy"
                              placeholderText="Required"
                              className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none w-[100px] cursor-pointer"
                              popperClassName="custom-datepicker-popper"
                            />
                            {exportSchedule && (
                              <button type="button" onClick={() => setExportSchedule(null)} className="ml-1 text-gray-300 hover:text-gray-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* From */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wider">From <span className="text-red-400">*</span></span>
                          <div className={`flex items-center gap-1 bg-white border-2 rounded-xl px-3 py-1.5 shadow-sm transition ${scheduleTimeFrom ? 'border-orange-300' : 'border-red-200'}`}>
                            <Clock className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                            <DatePicker
                              selected={scheduleTimeFrom}
                              onChange={(date: Date | null) => setScheduleTimeFrom(date)}
                              showTimeSelect showTimeSelectOnly timeIntervals={15} timeCaption="From" dateFormat="hh:mm aa"
                              placeholderText="Required"
                              className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none w-[75px] cursor-pointer"
                              popperClassName="custom-datepicker-popper"
                            />
                            {scheduleTimeFrom && (
                              <button type="button" onClick={() => setScheduleTimeFrom(null)} className="ml-1 text-gray-300 hover:text-gray-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* To */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wider">To <span className="text-red-400">*</span></span>
                          <div className={`flex items-center gap-1 bg-white border-2 rounded-xl px-3 py-1.5 shadow-sm transition ${scheduleTimeTo ? 'border-orange-300' : 'border-red-200'}`}>
                            <Clock className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                            <DatePicker
                              selected={scheduleTimeTo}
                              onChange={(date: Date | null) => setScheduleTimeTo(date)}
                              showTimeSelect showTimeSelectOnly timeIntervals={15} timeCaption="To" dateFormat="hh:mm aa"
                              placeholderText="Required"
                              className="text-sm font-semibold text-gray-700 bg-transparent focus:outline-none w-[75px] cursor-pointer"
                              popperClassName="custom-datepicker-popper"
                            />
                            {scheduleTimeTo && (
                              <button type="button" onClick={() => setScheduleTimeTo(null)} className="ml-1 text-gray-300 hover:text-gray-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Every */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wider">Every (days) *</span>
                          <input
                            type="number" min={1}
                            value={scheduleFrequency ?? ''}
                            placeholder="–"
                            onChange={e => { const v = parseInt(e.target.value); setScheduleFrequency(isNaN(v) ? null : Math.max(1, v)); }}
                            className={`w-14 px-2 py-1.5 text-sm font-semibold border-2 rounded-xl focus:outline-none focus:border-orange-400 bg-white text-center ${scheduleFrequency === null ? 'border-orange-300 placeholder-orange-300' : 'border-gray-200'}`}
                          />
                        </div>
                        {/* Timezone */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wider">Timezone *</span>
                          <select
                            value={scheduleTimezone}
                            onChange={e => {
                              const newTz = e.target.value;
                              if (!newTz) { setScheduleTimezone(''); prevTimezoneRef.current = ''; return; }
                              const oldTz = prevTimezoneRef.current;
                              prevTimezoneRef.current = newTz;
                              const getOffsetMs = (tz: string) => {
                                const ref = new Date();
                                const utc = new Date(ref.toLocaleString('en-US', { timeZone: 'UTC' }));
                                const tzd = new Date(ref.toLocaleString('en-US', { timeZone: tz }));
                                return tzd.getTime() - utc.getTime();
                              };
                              if (oldTz) {
                                const diff = getOffsetMs(newTz) - getOffsetMs(oldTz);
                                if (scheduleTimeFrom) setScheduleTimeFrom(new Date(scheduleTimeFrom.getTime() + diff));
                                if (scheduleTimeTo) setScheduleTimeTo(new Date(scheduleTimeTo.getTime() + diff));
                              }
                              setScheduleTimezone(newTz);
                            }}
                            className={`px-2 py-1.5 text-sm font-semibold border-2 rounded-xl focus:outline-none focus:border-orange-400 bg-white ${!scheduleTimezone ? 'border-orange-300 text-gray-400' : 'border-gray-200'}`}
                          >
                            <option value="">Select timezone</option>
                            <option value="America/New_York">Eastern (ET)</option>
                            <option value="America/Chicago">Central (CT)</option>
                            <option value="America/Denver">Mountain (MT)</option>
                            <option value="America/Los_Angeles">Pacific (PT)</option>
                            <option value="America/Phoenix">Arizona (AZ)</option>
                            <option value="America/Anchorage">Alaska (AK)</option>
                            <option value="Pacific/Honolulu">Hawaii (HI)</option>
                            <option value="Europe/London">London (GMT)</option>
                            <option value="Europe/Paris">Paris (CET)</option>
                            <option value="Asia/Manila">Manila (PHT)</option>
                            <option value="Asia/Singapore">Singapore (SGT)</option>
                            <option value="Asia/Tokyo">Tokyo (JST)</option>
                            <option value="Asia/Dubai">Dubai (GST)</option>
                            <option value="Australia/Sydney">Sydney (AEDT)</option>
                            <option value="UTC">UTC</option>
                          </select>
                        </div>
                        {/* Recycle */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wider">Recycle</span>
                          <button
                            type="button"
                            onClick={() => setExportRecycle(r => !r)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all duration-200 ${exportRecycle ? 'bg-teal-50 border-teal-400 text-teal-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                          >
                            <div className={`w-8 h-4 rounded-full transition-all duration-200 relative ${exportRecycle ? 'bg-teal-500' : 'bg-gray-200'}`}>
                              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200 ${exportRecycle ? 'left-4' : 'left-0.5'}`} />
                            </div>
                            <span className="text-xs font-bold">{exportRecycle ? 'TRUE' : 'FALSE'}</span>
                          </button>
                        </div>
                        <div className="flex-1" />
                        {/* Export CSV button */}
                        <button
                          type="button"
                          disabled={exportable.length === 0 || !exportSchedule || !scheduleTimeFrom || !scheduleTimeTo || scheduleFrequency === null || !scheduleTimezone || sendingToN8n}
                          onClick={async () => {
                            const scheduleResult = await generateAndSave();
                            const header = ['Title', 'Link', 'Caption', 'Content', 'Approve', 'Recycle', 'Schedule', 'Time From', 'Time To', 'Timezone', 'Comment', 'Category', 'Shorten Link'];
                            const pad2 = (n: number) => String(n).padStart(2, '0');
                            const to12h = (d: Date) => { const h = d.getHours(); const m = d.getMinutes(); const ampm = h >= 12 ? 'PM' : 'AM'; return `${pad2(h % 12 || 12)}:${pad2(m)} ${ampm}`; };
                            const fromStr = scheduleTimeFrom ? to12h(scheduleTimeFrom) : '';
                            const toStr = scheduleTimeTo ? to12h(scheduleTimeTo) : '';
                            const rows = exportable.map(i => [
                              i.file_name.replace(/\.[^/.]+$/, ''),
                              i.public_url,
                              i.caption || '',
                              i.content || '',
                              i.status === 'approved' ? 'TRUE' : 'FALSE',
                              exportRecycle ? 'TRUE' : 'FALSE',
                              scheduleResult[i.id] || '',
                              fromStr,
                              toStr,
                              scheduleTimezone,
                              i.comment || '',
                              'Photo',
                              'TRUE',
                            ].map(v => `"${String(v).replace(/"/g, '""')}"`));
                            const csv = [header, ...rows].map(r => r.join(',')).join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `posts-${new Date().toISOString().slice(0, 10)}.csv`;
                            a.click(); URL.revokeObjectURL(url);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-extrabold text-white bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 rounded-xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <span className="flex flex-col items-start leading-tight">
                            <span>{sendingToN8n ? 'Saving…' : `Export CSV${exportable.length > 0 ? ` (${exportable.length})` : ''}`}</span>
                            {!sendingToN8n && exportable.length > 0 && (
                              <span className="text-[9px] font-normal opacity-80 tracking-wide">Schedule will be saved</span>
                            )}
                          </span>
                          {sendingToN8n ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </button>
                      </div>
                      {(!exportSchedule || !scheduleTimeFrom || !scheduleTimeTo || scheduleFrequency === null || !scheduleTimezone) && exportable.length > 0 && (
                        <div className="px-5 pb-3">
                          <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
                            <span>⚠</span> Date, From, To, Every (days), and Timezone are all required.
                          </p>
                        </div>
                      )}
                      {exportToast && (
                        <div className="px-5 pb-3">
                          <p className="text-xs font-semibold text-green-600 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            {exportToast}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {loading ? (
                  <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" /><p className="text-sm text-gray-500">Loading...</p></div>
                ) : images.filter(i => i.content || i.caption).length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-3xl border border-gray-200">
                    <LayoutList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500">No generated content yet</p>
                    <p className="text-xs text-gray-400 mt-1">Generate content for your images first, then review them here.</p>
                    <button type="button" onClick={() => setDashboardView('gallery')} className="mt-4 px-4 py-2 text-xs font-bold text-orange-600 border border-orange-300 rounded-xl hover:bg-orange-50 transition">Go to Gallery</button>
                  </div>
                ) : reviewSelectedId !== null ? (() => {
                  const img = images.find(i => i.id === reviewSelectedId);
                  if (!img) return null;
                  return (
                    <div className="space-y-4">
                      <button type="button" onClick={() => { setReviewSelectedId(null); setEditingId(null); }}
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition">
                        <ArrowLeft className="w-4 h-4" /> Back to grid
                      </button>
                      <div className={`rounded-2xl border-2 bg-white shadow-sm overflow-hidden ${img.status === 'approved' ? 'border-green-300' : 'border-gray-200'}`}>
                        <div className="flex flex-col md:flex-row">
                          <div className="md:w-56 flex-shrink-0 bg-gray-100 relative">
                            <img src={thumbUrl(img.public_url, 400)} alt={img.file_name} loading="lazy" className="w-full h-56 md:h-full object-cover" onError={e => { e.currentTarget.src = img.public_url; }} />
                            <div className="absolute top-2 left-2" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedForExport.has(img.id)}
                                onChange={() => setSelectedForExport(prev => { const next = new Set(prev); next.has(img.id) ? next.delete(img.id) : next.add(img.id); return next; })}
                                className="w-4 h-4 accent-orange-500 cursor-pointer rounded shadow" />
                            </div>
                          </div>
                          <div className="flex-1 p-5">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div>
                                <p className="text-sm font-extrabold text-gray-900">{img.file_name}</p>
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${img.status === 'approved' ? 'bg-green-100 text-green-700' : img.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{img.status.replace(/_/g, ' ')}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {editingId === img.id ? (
                                  <>
                                    <button type="button" onClick={saveEdit} disabled={savingEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition disabled:opacity-60">
                                      {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                                    </button>
                                    <button type="button" onClick={cancelEdit} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">Cancel</button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => startEdit(img)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition">
                                      <Pencil className="w-3 h-3" /> Edit
                                    </button>
                                    <button type="button" onClick={() => approvePost(img)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition ${img.status === 'approved' ? 'text-green-700 bg-green-50 border-green-300 hover:bg-green-100' : 'text-white bg-green-600 border-green-600 hover:bg-green-700'}`}>
                                      <CheckCircle2 className="w-3 h-3" /> {img.status === 'approved' ? 'Approved' : 'Approve'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {(img.caption || editingId === img.id) && (
                              <div className="mb-3">
                                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1">Caption</p>
                                {editingId === img.id ? <textarea value={editValues.caption} onChange={e => setEditValues(v => ({ ...v, caption: e.target.value }))} className="w-full px-3 py-2 text-sm border-2 border-purple-200 rounded-xl focus:outline-none focus:border-purple-400 resize-none" rows={2} /> : <p className="text-sm text-gray-800">{img.caption}</p>}
                              </div>
                            )}
                            {(img.content || editingId === img.id) && (
                              <div className="mb-3">
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Content</p>
                                {editingId === img.id ? <textarea value={editValues.content} onChange={e => setEditValues(v => ({ ...v, content: e.target.value }))} className="w-full px-3 py-2 text-sm border-2 border-blue-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none" rows={4} /> : <p className="text-sm text-gray-700 whitespace-pre-wrap">{img.content}</p>}
                              </div>
                            )}
                            {(img.tags || editingId === img.id) && (
                              <div>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tags</p>
                                {editingId === img.id ? <input value={editValues.tags} onChange={e => setEditValues(v => ({ ...v, tags: e.target.value }))} className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-400" /> : (
                                  <div className="flex flex-wrap gap-1">{img.tags!.split(',').map(t => <span key={t.trim()} className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-md border border-gray-200">#{t.trim()}</span>)}</div>
                                )}
                              </div>
                            )}
                            <div className="mt-3">
                              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Internal Comment</p>
                              {editingId === img.id ? (
                                <textarea
                                  value={editValues.comment}
                                  onChange={e => setEditValues(v => ({ ...v, comment: e.target.value }))}
                                  placeholder="Add an internal note for your team (won't appear in the public post)"
                                  className="w-full px-3 py-2 text-sm border-2 border-amber-200 rounded-xl focus:outline-none focus:border-amber-400 resize-none"
                                  rows={2}
                                />
                              ) : img.comment ? (
                                <p className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{img.comment}</p>
                              ) : (
                                <p className="text-xs text-gray-400 italic">No comment. Click Edit to add one.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <>
                  <div className="flex items-center gap-2 px-1 py-2 bg-orange-50 rounded-xl border border-orange-100">
                    <Download className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <p className="text-[11px] text-orange-600 font-semibold">Check the images you want to include in the CSV export, then click <span className="font-extrabold">Export CSV</span>.</p>
                  </div>
                  {(() => {
                    const reviewFiltered = images.filter(i => (i.content || i.caption) && (galleryFolderFilter === 'all' || (galleryFolderFilter === 'unset' || galleryFolderFilter === null ? !i.folder_id : i.folder_id === galleryFolderFilter)));
                    const totalReviewPages = Math.max(1, Math.ceil(reviewFiltered.length / PAGE_SIZE));
                    const safeReviewPage = Math.min(reviewPage, totalReviewPages);
                    const pagedReview = reviewFiltered.slice((safeReviewPage - 1) * PAGE_SIZE, safeReviewPage * PAGE_SIZE);
                    return <>
                  {/* Review Pagination — top */}
                  {totalReviewPages > 1 && (
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                      <p className="text-xs text-gray-500">{reviewFiltered.length} post{reviewFiltered.length !== 1 ? 's' : ''} — page {safeReviewPage} of {totalReviewPages}</p>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={safeReviewPage <= 1} onClick={() => setReviewPage(safeReviewPage - 1)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Prev</button>
                        {Array.from({ length: totalReviewPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalReviewPages || Math.abs(p - safeReviewPage) <= 2)
                          .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                            if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('...');
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, idx) => p === '...' ? (
                            <span key={`rt-ellipsis-${idx}`} className="px-1 text-xs text-gray-400">...</span>
                          ) : (
                            <button key={p} type="button" onClick={() => setReviewPage(p as number)}
                              className={`w-8 h-8 text-xs font-bold rounded-lg transition ${p === safeReviewPage ? 'bg-orange-500 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-600'}`}>{p}</button>
                          ))}
                        <button type="button" disabled={safeReviewPage >= totalReviewPages} onClick={() => setReviewPage(safeReviewPage + 1)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next</button>
                      </div>
                    </div>
                  )}
                  {reviewViewMode === 'list' ? (
                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                    {/* List header */}
                    <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-50">
                      <div className="w-5 flex-shrink-0" />
                      <div className="w-12 flex-shrink-0" />
                      <p className="flex-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Brand / File</p>
                      <p className="w-32 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex-shrink-0">Status</p>
                      <p className="w-40 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex-shrink-0 text-right">Actions</p>
                    </div>
                    {pagedReview.map(img => {
                      const isApproved = img.status === 'approved';
                      const isSelected = selectedForExport.has(img.id);
                      return (
                        <div key={img.id} className={`flex items-center gap-4 px-4 py-3 transition-all ${isSelected ? 'bg-orange-50' : isApproved ? 'bg-green-50/40' : 'hover:bg-gray-50'}`}>
                          <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <label className="cursor-pointer">
                              <input type="checkbox" checked={isSelected} onChange={() => setSelectedForExport(prev => { const next = new Set(prev); next.has(img.id) ? next.delete(img.id) : next.add(img.id); return next; })} className="sr-only" />
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-300'}`}>
                                {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              </div>
                            </label>
                          </div>
                          <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                            <img src={thumbUrl(img.public_url, 96)} alt={img.file_name} loading="lazy" className="w-full h-full object-cover" onError={e => { e.currentTarget.src = img.public_url; }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{img.brand_profile_name || img.file_name}</p>
                            {img.brand_company_name && <p className="text-xs text-gray-400 truncate">{img.brand_company_name}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Completed</span>
                            {isApproved && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approved</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {(img.caption || img.content) && (
                              <button type="button" onClick={() => { setSelectedImage(img); setShowPreview(true); }}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg transition flex items-center gap-1.5">
                                <Eye className="w-3 h-3" /> Preview
                              </button>
                            )}
                            <button type="button" onClick={() => setReviewSelectedId(img.id)}
                              className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {pagedReview.map(img => {
                      const isApproved = img.status === 'approved';
                      const isSelected = selectedForExport.has(img.id);
                      return (
                        <div key={img.id} className={`rounded-2xl border-2 bg-white shadow-sm overflow-hidden flex flex-col transition-all duration-200 ${isApproved ? 'border-green-300 shadow-green-100' : isSelected ? 'border-orange-300' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'}`}>
                          {/* Image */}
                          <div className="relative bg-gray-100 overflow-hidden">
                            <img src={thumbUrl(img.public_url, 300)} alt={img.file_name} loading="lazy" className="w-full aspect-square object-cover" onError={e => { e.currentTarget.src = img.public_url; }} />

                            {/* Dark gradient overlay at bottom */}
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />

                            {/* Checkbox — top left */}
                            <div className="absolute top-2.5 left-2.5 z-10" onClick={e => e.stopPropagation()}>
                              <label className="flex items-center justify-center w-5 h-5 rounded-md cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => setSelectedForExport(prev => {
                                    const next = new Set(prev);
                                    next.has(img.id) ? next.delete(img.id) : next.add(img.id);
                                    return next;
                                  })}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${isSelected ? 'bg-orange-500 border-orange-500' : 'bg-white/80 border-gray-300'}`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                </div>
                              </label>
                            </div>

                            {/* Approved indicator — top right, small circle only */}
                            {isApproved && (
                              <div className="absolute top-2.5 right-2.5 z-10">
                                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-md ring-2 ring-white">
                                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                </div>
                              </div>
                            )}

                            {/* Approved label — bottom right over gradient */}
                            {isApproved && (
                              <div className="absolute bottom-2 right-2.5 z-10">
                                <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/90 text-white backdrop-blur-sm">
                                  Approved
                                </span>
                              </div>
                            )}

                            {/* Status pill — bottom left over gradient */}
                            <div className="absolute bottom-2 left-2.5 z-10">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white border border-white/30">
                                {img.status === 'processing' ? 'Processing...' : 'Completed'}
                              </span>
                            </div>
                          </div>

                          {/* Card body */}
                          <div className="p-3 flex flex-col gap-2 flex-1">
                            {img.brand_profile_name ? (
                              <div>
                                <p className="text-xs font-extrabold text-gray-900 truncate leading-tight">{img.brand_profile_name}</p>
                                {img.brand_company_name && <p className="text-[10px] text-gray-400 truncate mt-0.5">{img.brand_company_name}</p>}
                              </div>
                            ) : (
                              <p className="text-xs font-extrabold text-gray-900 truncate leading-tight">{img.file_name}</p>
                            )}

                            <div className="mt-auto flex flex-col gap-1.5 pt-1">
                              {(img.caption || img.content) && (
                                <button type="button" onClick={() => { setSelectedImage(img); setShowPreview(true); }}
                                  className="w-full px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm">
                                  <Eye className="w-3 h-3" /> Preview
                                </button>
                              )}
                              <button type="button" onClick={() => setReviewSelectedId(img.id)}
                                className="w-full px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center justify-center gap-1.5">
                                View Details
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                  </>;
                  })()}
                  </>
                )}
              </div>
              )
            )}

            {/* ── SCHEDULE VIEW ── */}
            {dashboardView === 'schedule' && (
              galleryFolderFilter === 'unset' && !loading && images.length > 0 ? (
                <div className="rounded-3xl border border-gray-200/60 bg-white/70 backdrop-blur-sm shadow-sm overflow-hidden p-8">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center shadow-lg">
                      <FolderOpen className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-base font-extrabold text-gray-900">Select a Folder</h3>
                    <p className="text-sm text-gray-500 mt-1">Choose a folder to view scheduled posts</p>
                  </div>
                  {folders.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                      {folders.map(f => (
                        <button key={f.id} type="button" onClick={() => setGalleryFolderFilter(f.id)}
                          className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-orange-400 hover:bg-orange-50 transition-all shadow-sm hover:shadow-md">
                          <Folder className="w-7 h-7 text-orange-400" />
                          <span className="text-sm font-bold text-gray-900 truncate max-w-full">{f.name}</span>
                          <span className="text-xs text-gray-400">{images.filter(i => scheduledPosts[i.id] && i.folder_id === f.id).length} scheduled</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-400">No folders yet. Create one using the <span className="font-bold text-gray-600">Folder</span> button above.</p>
                    </div>
                  )}
                  <div className="mt-6 flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 max-w-2xl mx-auto">
                    <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <p className="text-xs text-blue-600 font-semibold">Schedule posts from the Review Queue using Export CSV — they'll appear here once scheduled.</p>
                  </div>
                </div>
              ) : (
              <div className="space-y-6">
                {/* Active folder indicator */}
                <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold text-gray-900">
                      {typeof galleryFolderFilter === 'number' ? folders.find(f => f.id === galleryFolderFilter)?.name || 'Folder' : galleryFolderFilter === null ? 'Unfiled' : 'All Folders'}
                    </span>
                  </div>
                  <button type="button" onClick={() => setGalleryFolderFilter('unset')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-lg transition">
                    <FolderOpen className="w-3.5 h-3.5" /> Change Folder
                  </button>
                </div>
                {(() => {
                  const allScheduledImgs = images.filter(i => scheduledPosts[i.id] && (galleryFolderFilter === 'all' || (galleryFolderFilter === 'unset' || galleryFolderFilter === null ? !i.folder_id : i.folder_id === galleryFolderFilter)));
                  const scheduledImgs = scheduleFilter === 'approved'
                    ? allScheduledImgs.filter(i => i.status === 'approved')
                    : scheduleFilter === 'not_approved'
                    ? allScheduledImgs.filter(i => i.status !== 'approved')
                    : allScheduledImgs;
                  if (!allScheduledImgs.length) return (
                    <div className="text-center py-16 bg-white rounded-3xl border border-gray-200">
                      <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-gray-500">No scheduled posts yet</p>
                      <p className="text-xs text-gray-400 mt-1">Select posts in the Review Queue and click Export CSV.</p>
                      <button type="button" onClick={() => setDashboardView('review')} className="mt-4 px-4 py-2 text-xs font-bold text-orange-600 border border-orange-300 rounded-xl hover:bg-orange-50 transition">Go to Review Queue</button>
                    </div>
                  );
                  const totalSchedulePages = Math.max(1, Math.ceil(scheduledImgs.length / PAGE_SIZE));
                  const safeSchedulePage = Math.min(schedulePage, totalSchedulePages);
                  const pagedSchedule = scheduledImgs.slice((safeSchedulePage - 1) * PAGE_SIZE, safeSchedulePage * PAGE_SIZE);
                  return (
                    <>
                      {/* Summary bar */}
                      <div className="flex flex-col gap-2">
                        {/* Row 1: counts + filters + pagination */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-sm font-bold text-gray-800">
                              <span className="text-orange-500">{allScheduledImgs.length}</span> post{allScheduledImgs.length !== 1 ? 's' : ''} scheduled
                            </p>
                            {/* Filter tabs */}
                            <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-xl">
                              {([['all', 'All', allScheduledImgs.length], ['approved', 'Approved', allScheduledImgs.filter(i => i.status === 'approved').length], ['not_approved', 'Not Approved', allScheduledImgs.filter(i => i.status !== 'approved').length]] as [typeof scheduleFilter, string, number][]).map(([val, label, count]) => (
                                <button key={val} type="button"
                                  onClick={() => { setScheduleFilter(val); setSchedulePage(1); }}
                                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all ${scheduleFilter === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                  {label}
                                  <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded-full ${scheduleFilter === val ? (val === 'approved' ? 'bg-green-100 text-green-700' : val === 'not_approved' ? 'bg-gray-200 text-gray-600' : 'bg-orange-100 text-orange-600') : 'bg-gray-200 text-gray-500'}`}>{count}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500 flex-shrink-0">{scheduledImgs.length} post{scheduledImgs.length !== 1 ? 's' : ''}{totalSchedulePages > 1 ? ` — page ${safeSchedulePage} of ${totalSchedulePages}` : ''}</p>
                            {totalSchedulePages > 1 && (
                              <div className="flex items-center gap-1">
                                <button type="button" disabled={safeSchedulePage <= 1} onClick={() => setSchedulePage(safeSchedulePage - 1)}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Prev</button>
                                {Array.from({ length: totalSchedulePages }, (_, i) => i + 1)
                                  .filter(p => p === 1 || p === totalSchedulePages || Math.abs(p - safeSchedulePage) <= 2)
                                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                  }, [])
                                  .map((p, idx) => p === '...' ? (
                                    <span key={`ellipsis-s-${idx}`} className="px-1 text-xs text-gray-400">...</span>
                                  ) : (
                                    <button key={p} type="button" onClick={() => setSchedulePage(p as number)}
                                      className={`w-8 h-8 text-xs font-bold rounded-lg transition ${p === safeSchedulePage ? 'bg-purple-600 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-600'}`}>{p}</button>
                                  ))}
                                <button type="button" disabled={safeSchedulePage >= totalSchedulePages} onClick={() => setSchedulePage(safeSchedulePage + 1)}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next</button>
                              </div>
                            )}
                            <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-xl">
                              <button type="button" onClick={() => setScheduleViewMode('grid')}
                                className={`p-1.5 rounded-lg transition-all ${scheduleViewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                                <LayoutGrid className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={() => setScheduleViewMode('list')}
                                className={`p-1.5 rounded-lg transition-all ${scheduleViewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                                <LayoutList className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Row 2: date span + warning */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          {(() => {
                            const dates = Object.values(scheduledPosts).map(d => d.split(' ')[0]).filter(Boolean).sort();
                            if (dates.length < 1) return <span />;
                            const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            const first = dates[0], last = dates[dates.length - 1];
                            const span = Math.round((new Date(last + 'T00:00:00').getTime() - new Date(first + 'T00:00:00').getTime()) / 86400000) + 1;
                            const everyDaysValues = Object.values(scheduledTimings).map(t => t.every_days).filter(Boolean);
                            const everyDays = everyDaysValues.length > 0 ? everyDaysValues[0] : null;
                            const perDayLabel = everyDays === 1 ? '1 post / day' : everyDays ? `1 post every ${everyDays} days` : null;
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="font-semibold text-gray-700">{fmt(first)}</span>
                                {first !== last && <><span className="text-gray-400">→</span><span className="font-semibold text-gray-700">{fmt(last)}</span></>}
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-500">{span} day{span !== 1 ? 's' : ''} total</span>
                                {perDayLabel && <><span className="text-gray-300">|</span><span className="font-semibold text-orange-500">{perDayLabel}</span></>}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-amber-500 font-bold">⚠</span>
                            <span className="text-gray-500">Only</span>
                            <span className="font-bold text-green-600">{allScheduledImgs.filter(i => i.status === 'approved').length} approved</span>
                            <span className="text-gray-500">post{allScheduledImgs.filter(i => i.status === 'approved').length !== 1 ? 's' : ''} will be posted — the rest remain</span>
                            <span className="font-bold text-amber-500">Queued</span>
                          </div>
                        </div>
                      </div>

                      {/* Cards grid / list */}
                      {scheduleViewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {pagedSchedule.map((img) => {
                            const scheduled = scheduledPosts[img.id] || '';
                            const status = savedScheduleStatus[img.id];
                            const [datePart, timePart] = scheduled.split(' ');
                            const postTz = scheduledTimings[img.id]?.timezone || 'UTC';
                            const nowInPostTz = new Date(new Date().toLocaleString('en-US', { timeZone: postTz }));
                            const isOverdue = status === 'pending' && scheduled && new Date(scheduled.replace(' ', 'T')) < nowInPostTz;
                            return (
                              <div key={img.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden hover:shadow-md transition-shadow ${isOverdue ? 'border-red-300' : 'border-gray-200'}`}>
                                <div className="aspect-video bg-gray-100 overflow-hidden relative">
                                  <img src={thumbUrl(img.public_url, 400)} alt={img.file_name} loading="lazy" className="w-full h-full object-cover" onError={e => { e.currentTarget.src = img.public_url; }} />
                                  <div className="absolute top-2 right-2">
                                    {img.status === 'approved'
                                      ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-green-500 text-white rounded-full shadow">Approved</span>
                                      : <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-gray-700/70 text-white rounded-full">Not Approved</span>
                                    }
                                  </div>
                                  <div className="absolute top-2 left-2">
                                    {status === 'sent' && <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-green-100 text-green-700 rounded-full">Sent</span>}
                                    {isOverdue
                                      ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-red-500 text-white rounded-full">Overdue</span>
                                      : status === 'pending' && <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-yellow-100 text-yellow-700 rounded-full">Queued</span>
                                    }
                                    {status === 'failed' && <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-red-100 text-red-700 rounded-full">Failed</span>}
                                  </div>
                                </div>
                                <div className="p-3 space-y-2">
                                  <p className="text-sm font-bold text-gray-900 truncate">{img.brand_profile_name || img.file_name}</p>
                                  <div className="flex items-center gap-2">
                                    <div className={`flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                                      <Calendar className={`w-3.5 h-3.5 flex-shrink-0 ${isOverdue ? 'text-red-400' : 'text-orange-400'}`} />
                                      <span className={`text-xs font-bold ${isOverdue ? 'text-red-700' : 'text-orange-700'}`}>{datePart || '—'}</span>
                                    </div>
                                    <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                                      <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${isOverdue ? 'text-red-400' : 'text-orange-400'}`} />
                                      <span className={`text-xs font-bold ${isOverdue ? 'text-red-700' : 'text-orange-700'}`}>{timePart || '—'}</span>
                                    </div>
                                  </div>
                                  {scheduledTimings[img.id] && (
                                    <div className="space-y-0.5">
                                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3 flex-shrink-0" />
                                        Randomly picked from{' '}
                                        <span className="font-semibold text-gray-500">{scheduledTimings[img.id].from}</span>
                                        {' – '}
                                        <span className="font-semibold text-gray-500">{scheduledTimings[img.id].to}</span>
                                      </p>
                                      {scheduledTimings[img.id].timezone && (
                                        <p className="text-[10px] text-orange-500 font-semibold flex items-center gap-1">
                                          🌐 {scheduledTimings[img.id].timezone}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
                          {pagedSchedule.map((img) => {
                            const scheduled = scheduledPosts[img.id] || '';
                            const status = savedScheduleStatus[img.id];
                            const [datePart, timePart] = scheduled.split(' ');
                            const postTz = scheduledTimings[img.id]?.timezone || 'UTC';
                            const nowInPostTz = new Date(new Date().toLocaleString('en-US', { timeZone: postTz }));
                            const isOverdue = status === 'pending' && scheduled && new Date(scheduled.replace(' ', 'T')) < nowInPostTz;
                            return (
                              <div key={img.id} className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition ${isOverdue ? 'bg-red-50/40' : ''}`}>
                                {/* Thumbnail */}
                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                                  <img src={thumbUrl(img.public_url, 100)} alt={img.file_name} loading="lazy" className="w-full h-full object-cover" onError={e => { e.currentTarget.src = img.public_url; }} />
                                </div>
                                {/* Name */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate">{img.brand_profile_name || img.file_name}</p>
                                  {scheduledTimings[img.id] && (
                                    <p className="text-[10px] text-gray-400 truncate">
                                      {scheduledTimings[img.id].from} – {scheduledTimings[img.id].to}
                                      {scheduledTimings[img.id].timezone && <span className="ml-1 text-orange-400">· {scheduledTimings[img.id].timezone}</span>}
                                    </p>
                                  )}
                                </div>
                                {/* Date & Time */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${isOverdue ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                                    <Calendar className="w-3.5 h-3.5" />{datePart || '—'}
                                  </div>
                                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${isOverdue ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
                                    <Clock className="w-3.5 h-3.5" />{timePart || '—'}
                                  </div>
                                </div>
                                {/* Badges */}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {img.status === 'approved'
                                    ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-green-100 text-green-700 rounded-full">Approved</span>
                                    : <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-gray-100 text-gray-500 rounded-full">Not Approved</span>
                                  }
                                  {isOverdue
                                    ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-red-100 text-red-700 rounded-full">Overdue</span>
                                    : status === 'pending' ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-yellow-100 text-yellow-700 rounded-full">Queued</span>
                                    : status === 'sent' ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-green-100 text-green-700 rounded-full">Sent</span>
                                    : status === 'failed' ? <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-red-100 text-red-700 rounded-full">Failed</span>
                                    : null
                                  }
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              )
            )}

          </>
        )}
      </div>

      {/* ── Folder Picker Modal ── */}
      {showFolderPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => { setShowFolderPicker(false); setShowNewFolderInput(false); setNewFolderName(''); setEditingFolderId(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center shadow-md">
                    <Folder className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-gray-900">Folders</h2>
                    <p className="text-xs text-gray-500">{folders.length} folder{folders.length !== 1 ? 's' : ''} · {images.length} total images</p>
                  </div>
                </div>
                <button type="button" onClick={() => { setShowFolderPicker(false); setShowNewFolderInput(false); setNewFolderName(''); setEditingFolderId(null); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Options */}
            <div className="px-5 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {folders.map(f => {
                const count = images.filter(i => i.folder_id === f.id).length;
                const isEditing = editingFolderId === f.id;
                const isActive = galleryFolderFilter === f.id;
                return (
                  <div key={f.id} className={`w-full flex items-center gap-3 px-5 py-4 rounded-xl border-2 text-left transition ${isActive ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50 hover:border-orange-300 hover:bg-orange-50/40'}`}>
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Folder className="w-5 h-5 text-orange-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={editingFolderName}
                          onChange={e => setEditingFolderName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editingFolderName.trim()) renameFolder(f.id, editingFolderName);
                            if (e.key === 'Escape') { setEditingFolderId(null); setEditingFolderName(''); }
                          }}
                          autoFocus
                          className="flex-1 px-3 py-1.5 text-sm font-bold border-2 border-orange-300 rounded-lg focus:outline-none focus:border-orange-500 bg-white"
                        />
                        <button type="button" disabled={!editingFolderName.trim()} onClick={() => renameFolder(f.id, editingFolderName)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition disabled:opacity-40">
                          Save
                        </button>
                        <button type="button" onClick={() => { setEditingFolderId(null); setEditingFolderName(''); }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div role="button" tabIndex={0}
                          onClick={() => { setGalleryFolderFilter(f.id); setShowFolderPicker(false); }}
                          onKeyDown={e => e.key === 'Enter' && (setGalleryFolderFilter(f.id), setShowFolderPicker(false))}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                          <Folder className="w-5 h-5 text-orange-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-bold text-gray-900 truncate block">{f.name}</span>
                            <p className="text-[11px] text-gray-400">{count} image{count !== 1 ? 's' : ''} · Created {new Date(f.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="text-sm font-extrabold text-gray-400 flex-shrink-0">{count}</span>
                        <button type="button" onClick={() => { setEditingFolderId(f.id); setEditingFolderName(f.name); }}
                          className="p-1.5 text-gray-300 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition flex-shrink-0" title="Rename folder">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteFolder(f.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition flex-shrink-0" title="Delete folder">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Footer — New Folder */}
            <div className="px-5 pb-5 pt-3 border-t border-gray-100">
              {showNewFolderInput ? (
                <div className="flex items-center gap-2 mt-1">
                  <FolderPlus className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newFolderName.trim()) { createFolder(newFolderName); setNewFolderName(''); setShowNewFolderInput(false); }
                      if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); }
                    }}
                    placeholder="Folder name"
                    autoFocus
                    className="flex-1 px-3 py-2.5 text-sm font-semibold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400"
                  />
                  <button type="button" disabled={!newFolderName.trim()} onClick={() => { createFolder(newFolderName); setNewFolderName(''); setShowNewFolderInput(false); }}
                    className="px-4 py-2.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed">
                    Create
                  </button>
                  <button type="button" onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowNewFolderInput(true)}
                  className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-orange-600 border-2 border-dashed border-orange-300 hover:border-orange-400 hover:bg-orange-50 rounded-xl transition">
                  <FolderPlus className="w-4 h-4" /> New Folder
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Confirm Modal ── */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-extrabold text-gray-900">Delete {selectedForGenerate.size} image{selectedForGenerate.size !== 1 ? 's' : ''}?</p>
              <p className="text-sm text-gray-500 mt-1">This action cannot be undone. The images and all their content will be permanently removed.</p>
            </div>
            <div className="flex items-center gap-3 w-full mt-1">
              <button type="button" onClick={() => setBulkDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
                Cancel
              </button>
              <button type="button" onClick={() => { setBulkDeleteConfirm(false); bulkDelete(selectedForGenerate); }}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Progress Modal ── */}
      {generateProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4 relative">
            {generateProgress.done < generateProgress.total ? (
              <>
                <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-purple-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-gray-900">Generating AI content...</p>
                  <p className="text-sm text-gray-500 mt-1">{generateProgress.done} of {generateProgress.total} done</p>
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-[250px]">{generateProgress.current}</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(5, (generateProgress.done / generateProgress.total) * 100)}%` }} />
                </div>
                <p className="text-[11px] text-gray-400">AI is processing images in the background. You can safely close this tab — progress will continue.</p>
                <button
                  type="button"
                  onClick={async () => {
                    // Reset any remaining queued/processing images back to uploaded
                    const stuck = images.filter(i => i.status === 'queued' || i.status === 'processing');
                    if (stuck.length) {
                      await Promise.all(stuck.map(i => supabase.from('image_content').update({ status: 'uploaded' }).eq('id', i.id)));
                      setImages(prev => prev.map(i => (i.status === 'queued' || i.status === 'processing') ? { ...i, status: 'uploaded' } : i));
                    }
                    setGenerateProgress(null);
                    setBatchGenerating(false);
                  }}
                  className="text-xs text-gray-400 hover:text-red-500 underline transition"
                >
                  Cancel & dismiss
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-7 h-7 text-green-600" strokeWidth={3} />
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-gray-900">Generation complete!</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {generateProgress.total - generateProgress.failed} of {generateProgress.total} image{generateProgress.total !== 1 ? 's' : ''} generated successfully.
                  </p>
                  {generateProgress.failed > 0 && (
                    <p className="text-xs text-red-500 mt-1">{generateProgress.failed} failed — you can retry those later.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setGenerateProgress(null); setBatchGenerating(false); }}
                  className="mt-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Progress Modal ── */}
      {deleteProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4">
            {deleteProgress.done < deleteProgress.total ? (
              <>
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-gray-900">Deleting images...</p>
                  <p className="text-sm text-gray-500 mt-1">{deleteProgress.done} of {deleteProgress.total} removed</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${(deleteProgress.done / deleteProgress.total) * 100}%` }} />
                </div>
                <p className="text-[11px] text-gray-400">Please wait until all images are deleted.</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-7 h-7 text-green-600" strokeWidth={3} />
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-gray-900">Deleted!</p>
                  <p className="text-sm text-gray-500 mt-1">{deleteProgress.total} image{deleteProgress.total !== 1 ? 's' : ''} removed successfully.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Export / Save Schedule Toast ── */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </div>
            <span className="text-sm font-semibold">{exportToast}</span>
            <button type="button" onClick={() => setExportToast(null)} className="ml-1 text-gray-400 hover:text-white transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Upload Progress Modal ── */}
      {uploadProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4">
            {uploadProgress.done < uploadProgress.total ? (
              <>
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-gray-900">Uploading images...</p>
                  <p className="text-sm text-gray-500 mt-1">{uploadProgress.done} of {uploadProgress.total} done</p>
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-[250px]">{uploadProgress.current}</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 to-rose-500 rounded-full transition-all duration-300" style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                </div>
                <p className="text-[11px] text-gray-400">Please don't close this page until uploading is complete.</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-7 h-7 text-green-600" strokeWidth={3} />
                </div>
                <div className="text-center">
                  <p className="text-base font-extrabold text-gray-900">Upload complete!</p>
                  <p className="text-sm text-gray-500 mt-1">{uploadProgress.total} image{uploadProgress.total !== 1 ? 's' : ''} uploaded successfully.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-extrabold text-gray-900">Delete this image?</p>
              <p className="text-sm text-gray-500 mt-1">This action cannot be undone. The image and all its generated content will be permanently removed.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button type="button" onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition">
                No
              </button>
              <button type="button" onClick={confirmDelete} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Public Preview Modal ── */}
      {showPreview && selectedImage && (() => {
        const title = selectedImage.file_name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const readTime = selectedImage.content ? `${Math.max(1, Math.ceil(selectedImage.content.split(/\s+/).length / 200))} min read` : '1 min read';
        return (
        <div className="fixed inset-0 z-50 bg-[#fafafa] overflow-y-auto">
          {/* Minimal top bar */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
            <div className="max-w-[720px] mx-auto px-6 py-3 flex items-center justify-between">
              <button type="button" onClick={() => setShowPreview(false)} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition">
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => copyUrl(selectedImage.public_url)} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition">
                  {copiedUrl ? 'Copied!' : 'Share'}
                </button>
              </div>
            </div>
          </div>

          <article className="max-w-[720px] mx-auto px-6 pt-10 pb-20">
            {/* Category / Brand */}
            {brandProfile.company_name && (
              <div className="mb-6">
                <span className="text-sm font-bold text-blue-600 uppercase tracking-wider">{brandProfile.industry || brandProfile.company_name}</span>
              </div>
            )}

            {/* Title */}
            <h1 className="text-[2.5rem] sm:text-5xl font-black text-gray-900 leading-[1.1] tracking-tight mb-6">
              {brandProfile.company_name || title}
            </h1>

            {/* Subtitle from caption (first sentence) */}
            {selectedImage.caption && (
              <p className="text-xl text-gray-500 leading-relaxed mb-8 font-normal">
                {selectedImage.caption.split(/[.!?]/)[0].trim()}.
              </p>
            )}

            {/* Author bar */}
            <div className="flex items-center gap-4 mb-10 pb-8 border-b border-gray-200">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {(brandProfile.company_name || 'A').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{brandProfile.company_name || 'Author'}</div>
                <div className="text-xs text-gray-500">{readTime}</div>
              </div>
            </div>

            {/* Hero Image */}
            <figure className="mb-10 -mx-6 sm:-mx-12">
              <div className="overflow-hidden rounded-xl sm:rounded-2xl shadow-sm">
                <img
                  src={selectedImage.public_url}
                  alt={selectedImage.file_name}
                  className="w-full h-auto"
                />
              </div>
              <figcaption className="mt-3 text-center text-xs text-gray-400">
                {selectedImage.file_name}
              </figcaption>
            </figure>

            {/* Social Caption as pull quote */}
            {selectedImage.caption && (
              <blockquote className="my-10 pl-6 border-l-[3px] border-gray-900">
                <p className="text-xl sm:text-2xl font-medium text-gray-900 leading-relaxed">
                  {selectedImage.caption}
                </p>
              </blockquote>
            )}

            {/* Article body */}
            {selectedImage.content && (
              <div className="mb-12">
                {selectedImage.content.split('\n').filter(Boolean).map((paragraph, i) => (
                  <p key={i} className="text-[1.125rem] leading-[1.8] text-gray-700 mb-6 font-[410]">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center justify-center gap-2 my-12">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            </div>

            {/* Tags */}
            {selectedImage.tags && (
              <div className="mb-10">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedImage.tags.split(',').map(tag => (
                    <span key={tag.trim()} className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition cursor-default">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Author card footer */}
            <div className="mt-10 pt-8 border-t border-gray-200">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0">
                  {(brandProfile.company_name || 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-bold text-gray-900 mb-1">
                    Written by {brandProfile.company_name || 'Author'}
                  </div>
                  {brandProfile.industry && (
                    <p className="text-sm text-gray-500 mb-2">{brandProfile.industry}</p>
                  )}
                  {brandProfile.location && (
                    <p className="text-sm text-gray-500">{brandProfile.location}</p>
                  )}
                  {brandProfile.focus_areas.length > 0 && (
                    <p className="text-sm text-gray-400 mt-2">{brandProfile.focus_areas.join(' &middot; ')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Image source */}
            <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
              <img src={selectedImage.public_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{selectedImage.file_name}</p>
                <p className="text-[10px] text-gray-400 truncate">{selectedImage.public_url}</p>
              </div>
              <button type="button" onClick={() => copyUrl(selectedImage.public_url)} className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-white hover:bg-blue-50 rounded-lg border border-gray-200 transition flex-shrink-0">
                {copiedUrl ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
          </article>
        </div>
        );
      })()}

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transition-all duration-200"
          aria-label="Back to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
