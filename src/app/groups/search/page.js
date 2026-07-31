'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GroupCard from '@/components/GroupCard';
import { groups, searchGroups } from '@/lib/data';
import { HiSearch } from 'react-icons/hi';

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(initialQuery ? searchGroups(initialQuery) : groups);
  const [searched, setSearched] = useState(!!initialQuery);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setResults(searchGroups(query.trim()));
      setSearched(true);
    } else {
      setResults(groups);
      setSearched(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Find an Ajo Group</h1>
          <p className="text-gray-500">Search by group name or unique Group ID</p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="max-w-2xl mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by group name or ID (e.g., BF10248)"
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <HiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
            <button
              type="submit"
              className="bg-primary-600 text-white font-medium px-6 py-3.5 rounded-2xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
            >
              Search
            </button>
          </div>
        </form>

        {/* Results */}
        <div className="mb-4">
          <p className="text-sm text-gray-500">
            {searched
              ? `${results.length} group${results.length !== 1 ? 's' : ''} found for "${query}"`
              : `${results.length} group${results.length !== 1 ? 's' : ''} available`
            }
          </p>
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map(group => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiSearch className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Groups Found</h3>
            <p className="text-gray-500 mb-4">
              We couldn&apos;t find any groups matching your search. Try a different search term.
            </p>
            <button
              onClick={() => router.push('/groups/create')}
              className="bg-primary-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-primary-700 transition-all"
            >
              Create a New Group
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default function SearchGroupsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
