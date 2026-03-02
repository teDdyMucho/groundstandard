import { useState, useEffect } from 'react';
import { supabase, ResearchArticle } from '../lib/supabase';

type UseResearchDataParams = {
  page: number;
  pageSize: number;
  searchTerm?: string;
  statusFilter?: string;
};

export function useResearchData({ page, pageSize, searchTerm, statusFilter }: UseResearchDataParams) {
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      setError(null);

      const from = Math.max(0, (page - 1) * pageSize);
      const to = Math.max(from, from + pageSize - 1);

      let query = supabase
        .from('Research')
        .select('id, title, keyword, doc_link, content, generalize, website, business_name, status', { count: 'exact' })
        .order('id', { ascending: false });

      const trimmedSearch = (searchTerm ?? '').trim();
      if (trimmedSearch) {
        const escaped = trimmedSearch.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.or(
          `title.ilike.%${escaped}%,keyword.ilike.%${escaped}%,business_name.ilike.%${escaped}%`
        );
      }

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error: fetchError, count } = await query.range(from, to);

      if (fetchError) {
        throw fetchError;
      }

      setArticles(data || []);
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('Error fetching articles:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch articles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();

    // Set up real-time subscription
    const subscription = supabase
      .channel('research_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'Research' 
        }, 
        (payload) => {
          console.log('Real-time update:', payload);
          fetchArticles(); // Refetch data on any change
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [page, pageSize, searchTerm, statusFilter]);

  return {
    articles,
    totalCount,
    loading,
    error,
    refetch: fetchArticles
  };
}