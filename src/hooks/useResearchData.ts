import { useState, useEffect } from 'react';
import { supabase, ResearchArticle } from '../lib/supabase';

export function useResearchData() {
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('Research')
        .select('*');

      if (fetchError) {
        throw fetchError;
      }

      setArticles(data || []);
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
  }, []);

  return {
    articles,
    loading,
    error,
    refetch: fetchArticles
  };
}