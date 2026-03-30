import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ClipboardList, FileText, UserCircle, X, Eye, LogOut, Globe, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ToolCard = {
  title: string;
  description: string;
  features: string[];
  icon: ReactNode;
  iconWrapperClass: string;
  actionLabel: string;
  onAction: () => void;
  badge?: string;
};

type LaunchPadProps = {
  domainLabel: string;
  onLaunchArticleGenerator: () => void;
  onLaunchFormSubmission: () => void;
  onLaunchWebScraper: () => void;
  onLaunchImageEditor: () => void;
  onLaunchUpdateFormSubmission: () => void;
};

export default function LaunchPad({ onLaunchArticleGenerator, onLaunchFormSubmission, onLaunchWebScraper, onLaunchImageEditor, onLaunchUpdateFormSubmission }: LaunchPadProps) {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRow, setProfileRow] = useState<{
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string;
    updated_at: string;
  } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const openAccountModal = useCallback(async () => {
    setShowAccountModal(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    setIsEditingProfile(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_profile_get');
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : null;
      setProfileRow(row ?? null);
      setEditFullName((row?.full_name ?? '') as string);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load profile';
      setProfileError(msg);
      setProfileRow(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const saveProfile = useCallback(async () => {
    if (!profileRow) return;
    setProfileSaving(true);
    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('rpc_profile_update', {
        p_full_name: editFullName.trim() || null,
        p_avatar_url: null,
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : null;
      setProfileRow(row ?? profileRow);
      setEditFullName(((row?.full_name ?? editFullName) as string) ?? '');
      setIsEditingProfile(false);
      setProfileSaveSuccess('Profile updated successfully.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update profile';
      setProfileSaveError(msg);
    } finally {
      setProfileSaving(false);
    }
  }, [editFullName, profileRow]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const openJomasterTest = useCallback(() => {
    window.open('https://dojomaster-test.netlify.app', '_blank', 'noopener,noreferrer');
  }, []);

  const tools: ToolCard[] = [
    {
      title: 'Article Generator',
      description: 'Create and manage your articles with a clean workflow.',
      features: ['Write articles', 'Rewrite content', 'Manage saved items'],
      icon: <FileText className="w-5 h-5 text-white" />,
      iconWrapperClass: 'bg-gradient-to-br from-blue-600 to-indigo-600',
      actionLabel: 'Open',
      onAction: onLaunchArticleGenerator,
    },
    {
      title: 'Form submission',
      description: 'Collect and review submitted forms in one place.',
      features: ['View submissions', 'Manage records', 'Track updates'],
      icon: <ClipboardList className="w-5 h-5 text-white" />,
      iconWrapperClass: 'bg-gradient-to-br from-emerald-600 to-teal-600',
      actionLabel: 'Open',
      onAction: onLaunchFormSubmission,
    },
    {
      title: 'Web Scraper',
      description: 'Crawler workspace for extracting pages, metadata, and content from tracked websites.',
      features: ['Select targets', 'Preview extracted pages', 'Review pipeline activity'],
      icon: <Globe className="w-5 h-5 text-white" />,
      iconWrapperClass: 'bg-gradient-to-br from-violet-600 to-fuchsia-600',
      actionLabel: 'Open',
      onAction: onLaunchWebScraper,
    },
    {
      title: 'Dojomaster Test',
      description: 'Martial arts academy management platform for attendance, memberships, payments, and student operations.',
      features: ['Track attendance', 'Sell memberships and classes', 'Manage students and HighLevel sync'],
      icon: <Eye className="w-5 h-5 text-white" />,
      iconWrapperClass: 'bg-gradient-to-br from-purple-600 to-pink-600',
      actionLabel: 'Open Site',
      onAction: openJomasterTest,
    },
    {
      title: 'Image Content Editor',
      description: 'Edit, adjust, and enhance images with filters, text overlays, and transformations.',
      features: ['Adjust brightness, contrast & filters', 'Add text overlays', 'Rotate, flip & export'],
      icon: <ImageIcon className="w-5 h-5 text-white" />,
      iconWrapperClass: 'bg-gradient-to-br from-orange-500 to-rose-500',
      actionLabel: 'Open',
      onAction: onLaunchImageEditor,
    },
    {
      title: 'Form Integrations',
      description: 'See where your form submissions go and which services receive your leads.',
      features: ['View active integrations per site', 'Track CRM syncs and redirects', 'See latest contacts captured'],
      icon: <RefreshCw className="w-5 h-5 text-white" />,
      iconWrapperClass: 'bg-gradient-to-br from-cyan-600 to-blue-600',
      actionLabel: 'Open',
      onAction: onLaunchUpdateFormSubmission,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 text-gray-900">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute top-32 -right-56 h-[520px] w-[520px] rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 h-[520px] w-[520px] rounded-full bg-rose-200/20 blur-3xl" />
      </div>

      {/* Account Button - Top Right */}
      <div className="absolute top-6 right-6 z-10">
        <button
          type="button"
          onClick={openAccountModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-800 bg-white/90 backdrop-blur-sm hover:bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
        >
          <UserCircle className="w-4 h-4 mr-2" />
          Account
        </button>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Welcome Header */}
        <div className="text-center mb-12">
          <img 
            src="/image/icon.png" 
            alt="Ground Standard" 
            className="w-16 h-16 mx-auto mb-6 drop-shadow-sm"
          />
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-3 tracking-tight">
            Welcome to Ground Standard
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Your powerful content management platform. Select a tool below to get started.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="rounded-3xl border border-gray-200/60 bg-white/70 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(15,23,42,0.18)] overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {tools.map((tool) => (
                <div
                  key={tool.title}
                  className="group relative rounded-3xl p-[1px] bg-gradient-to-br from-blue-200/70 via-gray-200/50 to-indigo-200/70"
                >
                  <div className="rounded-3xl bg-white shadow-sm group-hover:shadow-lg transition-all duration-300 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start gap-4">
                        <div className={`mt-0.5 w-12 h-12 rounded-2xl ${tool.iconWrapperClass} flex items-center justify-center shadow-md flex-shrink-0`}>
                          {tool.icon}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-start gap-2 flex-wrap">
                            <div className="text-lg font-extrabold text-gray-900 tracking-tight leading-tight">{tool.title}</div>
                            {tool.badge && (
                              <div className="mt-0.5 text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700 leading-none">
                                {tool.badge}
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-2 leading-relaxed">{tool.description}</div>
                        </div>
                      </div>

                      <div className="mt-5 space-y-2">
                        {tool.features.map((f) => (
                          <div key={f} className="text-sm text-gray-700 flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600/70" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={tool.onAction}
                          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-extrabold rounded-2xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-600/20 hover:shadow-lg hover:shadow-blue-600/25 transition-all duration-200"
                        >
                          {tool.actionLabel}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
          <div className="relative bg-white/95 backdrop-blur-sm w-full max-w-xl mx-auto rounded-2xl shadow-2xl border border-gray-200 z-10 animate-in zoom-in-95 duration-300 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="w-full px-8 pt-7 pb-5 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
                      <UserCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-gray-900">Account</h3>
                      <p className="text-sm text-gray-600">Manage your profile details</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAccountModal(false)}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {profileLoading ? (
              <div className="px-8 pb-8 text-sm text-gray-600">Loading profile…</div>
            ) : profileError ? (
              <div className="px-8 pb-8 text-sm text-red-600">{profileError}</div>
            ) : !profileRow ? (
              <div className="px-8 pb-8 text-sm text-gray-600">No profile found.</div>
            ) : (
              <div className="px-8 pb-8 space-y-6">
                <div className="border-2 border-gray-100 rounded-2xl p-5 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Profile</div>
                      <div className="text-lg font-extrabold text-gray-900">Your details</div>
                    </div>
                    {!isEditingProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileSaveError(null);
                          setProfileSaveSuccess(null);
                          setEditFullName((profileRow.full_name ?? '') as string);
                          setIsEditingProfile(true);
                        }}
                        className="inline-flex items-center px-3 py-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-100 transition-all duration-200"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full name</label>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400"
                          placeholder="Your name"
                        />
                      ) : (
                        <div className="px-4 py-3 border-2 border-gray-100 rounded-xl bg-gray-50 text-sm font-semibold text-gray-900">
                          {profileRow.full_name || '—'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Role</label>
                      <div className="px-4 py-3 border-2 border-gray-100 rounded-xl bg-gray-50 text-sm font-semibold text-gray-900">
                        {profileRow.role}
                      </div>
                    </div>
                  </div>

                  {profileSaveError && (
                    <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                      {profileSaveError}
                    </div>
                  )}
                  {profileSaveSuccess && (
                    <div className="mt-4 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
                      {profileSaveSuccess}
                    </div>
                  )}

                  {isEditingProfile && (
                    <div className="flex items-center justify-end gap-2 mt-5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProfile(false);
                          setEditFullName((profileRow.full_name ?? '') as string);
                          setProfileSaveError(null);
                          setProfileSaveSuccess(null);
                        }}
                        disabled={profileSaving}
                        className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveProfile}
                        disabled={profileSaving}
                        className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
                      >
                        {profileSaving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">You can update your name anytime.</div>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-white bg-black hover:bg-black/90 rounded-xl shadow-sm"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-blue-600/5 via-transparent to-rose-600/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center shadow-md">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Confirm logout</h3>
                    <p className="text-xs text-gray-500">Are you sure you want to log out?</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 shadow-sm"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowLogoutConfirm(false);
                    await handleLogout();
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
