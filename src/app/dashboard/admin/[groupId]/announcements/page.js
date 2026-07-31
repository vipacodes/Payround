'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AnnouncementCard from '@/components/AnnouncementCard';
import { getGroupById } from '@/lib/data';
import {
  HiArrowLeft, HiPhotograph, HiVideoCamera,
  HiPlus, HiX
} from 'react-icons/hi';
import { HiMegaphone, HiPaperAirplane } from 'react-icons/hi2';
import toast from 'react-hot-toast';

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
  });

  useEffect(() => {
    const found = getGroupById(params.groupId);
    if (found) {
      setGroup(found);
      setAnnouncements(found.announcements || []);
    }
  }, [params.groupId]);

  if (!group) return null;

  const handlePost = () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    const ann = {
      id: `ann${Date.now()}`,
      title: newAnnouncement.title,
      content: newAnnouncement.content,
      media: [],
      date: new Date().toISOString().split('T')[0],
      author: 'Admin',
    };

    setAnnouncements(prev => [ann, ...prev]);
    setNewAnnouncement({ title: '', content: '' });
    setShowNew(false);
    toast.success('Announcement posted!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
            <p className="text-gray-500">{group.name}</p>
          </div>
          <button
            onClick={() => setShowNew(!showNew)}
            className="flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-all"
          >
            {showNew ? <HiX className="w-4 h-4" /> : <HiPlus className="w-4 h-4" />}
            {showNew ? 'Cancel' : 'New Post'}
          </button>
        </div>

        {/* New Announcement Form */}
        {showNew && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <HiMegaphone className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold text-gray-900">New Announcement</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newAnnouncement.title}
                  onChange={(e) => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Announcement title..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={newAnnouncement.content}
                  onChange={(e) => setNewAnnouncement(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Write your announcement..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-all">
                  <HiPhotograph className="w-4 h-4" />
                  Add Image
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-all">
                  <HiVideoCamera className="w-4 h-4" />
                  Add Video
                </button>
              </div>
              <button
                onClick={handlePost}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-medium py-3 rounded-xl hover:bg-primary-700 transition-all"
              >
                <HiPaperAirplane className="w-4 h-4" />
                Post Announcement
              </button>
            </div>
          </div>
        )}

        {/* Announcements List */}
        <div className="space-y-4">
          {announcements.length > 0 ? (
            announcements.map(ann => (
              <AnnouncementCard key={ann.id} announcement={ann} />
            ))
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <HiMegaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No announcements yet.</p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-3 text-primary-600 font-medium text-sm hover:text-primary-700"
              >
                Create the first announcement
              </button>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
