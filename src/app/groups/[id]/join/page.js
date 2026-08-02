'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LoadingScreen from '@/components/LoadingScreen';

// Joining now happens directly on the group page — tap green spots, agree to the
// group rules, one tap to join. This page just forwards old links there.
export default function JoinGroupRedirect() {
  const router = useRouter();
  const params = useParams();
  useEffect(() => {
    if (params?.id) router.replace(`/groups/${params.id}`);
  }, [params, router]);
  return <LoadingScreen label="Opening group…" />;
}
