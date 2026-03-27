/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  Book, 
  Calendar, 
  ChevronRight, 
  Download, 
  Flame, 
  LineChart, 
  Plus, 
  Settings, 
  Trophy, 
  User,
  Zap,
  CheckCircle2,
  ArrowRight,
  ShoppingBag,
  LogOut,
  ShieldCheck,
  Facebook,
  Mail,
  Save,
  Navigation,
  Heart,
  MessageSquare,
  Share2,
  Play,
  Square,
  MapPin,
  Clock,
  TrendingUp,
  Award,
  Send,
  UserPlus,
  UserMinus,
  Maximize2,
  Pause,
  Users,
  Search
} from 'lucide-react';
import { 
  LineChart as ReLineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cn } from './lib/utils';
import { generateTrainingPlan } from './lib/gemini';
import { TrainingPlan, Workout, UserStats, RunActivity, UserProfile, Community, CommunityEvent, ActivityType } from './types';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapComponent({ path, className }: { path: { lat: number; lng: number }[], className?: string }) {
  if (path.length === 0) return <div className={cn("bg-white/5 rounded-3xl flex items-center justify-center text-white/20", className)}>Sem dados de GPS</div>;
  
  const center = path[Math.floor(path.length / 2)];
  
  return (
    <div className={cn("rounded-3xl overflow-hidden border border-white/10", className)}>
      <MapContainer center={[center.lat, center.lng]} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Polyline positions={path.map(p => [p.lat, p.lng])} color="#EA580C" weight={5} opacity={0.8} />
        <Marker position={[path[0].lat, path[0].lng]} />
        <Marker position={[path[path.length - 1].lat, path[path.length - 1].lng]} />
      </MapContainer>
    </div>
  );
}

// Haversine formula to calculate distance between two points in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

// Mock Data
const MOCK_STATS: UserStats = {
  totalDistance: 124.5,
  totalTime: 780,
  averagePace: "5:45",
  weeklyProgress: [
    { day: 'Seg', distance: 5 },
    { day: 'Ter', distance: 8 },
    { day: 'Qua', distance: 0 },
    { day: 'Qui', distance: 10 },
    { day: 'Sex', distance: 6 },
    { day: 'Sáb', distance: 15 },
    { day: 'Dom', distance: 0 },
  ]
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'ebook' | 'admin' | 'run' | 'feed' | 'profile' | 'communities'>('home');
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [activities, setActivities] = useState<RunActivity[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | undefined>(undefined);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // GPS Tracking State
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [accumulatedTime, setAccumulatedTime] = useState(0);
  const [currentRun, setCurrentRun] = useState<{
    distance: number;
    duration: number;
    path: { lat: number; lng: number }[];
    startTime: number | null;
  }>({ distance: 0, duration: 0, path: [], startTime: null });
  const [watchId, setWatchId] = useState<number | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [ebookUrl, setEbookUrl] = useState("");
  const [pixData, setPixData] = useState<{ pixCode: string; qrCode: string } | null>(null);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [newCommunity, setNewCommunity] = useState({ name: "", description: "" });
  const [newEvent, setNewEvent] = useState({ title: "", description: "", date: "", location: "" });
  const [activityType, setActivityType] = useState<ActivityType>('Corrida');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryActivity, setSummaryActivity] = useState<any>(null);
  
  // Auth & Config State
  const [user, setUser] = useState<{ email: string; isAdmin: boolean } | null>(null);
  const [config, setConfig] = useState({ ebookPrice: 49.90, heroTitle: "TREINE COM INTELIGÊNCIA.", ebookUrl: "" });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TrainingPlan | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<RunActivity | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [generatorData, setGeneratorData] = useState({ goal: "Correr minha primeira maratona", level: "Intermediário", days: 4 });
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ displayName: "", bio: "" });
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [isFollowing, setIsFollowing] = useState(false);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/config').then(res => res.json()).then(setConfig);
    fetch('/api/activities').then(res => res.json()).then(setActivities);
    fetch('/api/communities').then(res => res.json()).then(setCommunities);
    
    fetch('/api/auth/me').then(res => res.json()).then(data => {
      setUser(data.user);
      if (data.user) {
        fetch('/api/plans').then(res => res.json()).then(setPlans);
        fetch(`/api/profile/${data.user.email}`).then(res => res.json()).then(setProfile);
        fetch('/api/purchases/check').then(res => res.json()).then(p => {
          setHasPurchased(p.hasPurchased);
          setEbookUrl(p.ebookUrl);
        });
        if (data.user.isAdmin) {
          fetch('/api/admin/purchases').then(res => res.json()).then(setRecentPurchases);
        }
      }
    });

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'AUTH_SUCCESS') {
        setUser(event.data.user);
        setShowLoginModal(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleLogin = (provider: 'google' | 'facebook' | 'mock') => {
    if (provider === 'mock') {
      // Fallback for development if keys are not set
      fetch('/api/auth/mock-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: "kaneki0202fake@gmail.com" })
      }).then(res => res.json()).then(data => {
        setUser(data.user);
        setShowLoginModal(false);
      });
      return;
    }

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    window.open(
      `/auth/${provider}`,
      'oauth_popup',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setActiveTab('home');
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editProfileData)
    });
    const data = await res.json();
    if (data.success) {
      setProfile(data.profile);
      setShowEditProfileModal(false);
    }
  };

  const handleCreateCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCommunity)
    });
    const data = await res.json();
    if (data.success) {
      setCommunities([...communities, data.community]);
      setShowCreateCommunityModal(false);
      setNewCommunity({ name: "", description: "" });
    }
  };

  const handleJoinCommunity = async (id: string) => {
    const res = await fetch(`/api/communities/${id}/join`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setCommunities(communities.map(c => c.id === id ? { ...c, members: data.members } : c));
    }
  };

  const handleLeaveCommunity = async (id: string) => {
    const res = await fetch(`/api/communities/${id}/leave`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setCommunities(communities.map(c => c.id === id ? { ...c, members: data.members } : c));
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommunity) return;
    const res = await fetch(`/api/communities/${selectedCommunity.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEvent)
    });
    const data = await res.json();
    if (data.success) {
      setCommunities(communities.map(c => c.id === selectedCommunity.id ? { ...c, events: [...c.events, data.event] } : c));
      setShowCreateEventModal(false);
      setNewEvent({ title: "", description: "", date: "", location: "" });
    }
  };

  const handleQuickPlan = async (type: '5k' | '10k' | '21k') => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setIsGenerating(true);
    const goals = {
      '5k': 'Correr 5km pela primeira vez',
      '10k': 'Completar 10km com ritmo constante',
      '21k': 'Meia Maratona: Foco em resistência'
    };
    const newPlan = await generateTrainingPlan(goals[type], "Iniciante", 3);
    if (newPlan) {
      await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlan)
      });
      setPlans([...plans, newPlan]);
    }
    setIsGenerating(false);
    setActiveTab('dashboard');
  };
  const handleUpdateConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ebookPrice: formData.get('ebookPrice'),
        heroTitle: formData.get('heroTitle'),
        ebookUrl: formData.get('ebookUrl')
      })
    });
    const data = await res.json();
    if (data.success) {
      setConfig(data.config);
      alert("Configurações salvas!");
    }
  };

  const getTodayWorkout = () => {
    if (plans.length === 0) return null;
    const latestPlan = plans[plans.length - 1];
    // For demo, we just pick the first one or one based on day of week
    const dayIndex = new Date().getDay(); // 0-6
    return latestPlan.workouts[dayIndex % latestPlan.workouts.length];
  };

  const todayWorkout = getTodayWorkout();

  // GPS Tracking Logic
  const startTracking = () => {
    if (!navigator.geolocation) {
      alert("GPS não suportado pelo seu navegador.");
      return;
    }

    setIsTracking(true);
    setIsPaused(false);
    setAccumulatedTime(0);
    setCurrentRun({ distance: 0, duration: 0, path: [], startTime: Date.now() });

    const id = navigator.geolocation.watchPosition(
      (position) => {
        if (isPaused) return;
        const { latitude, longitude } = position.coords;
        setCurrentRun(prev => {
          const newPoint = { lat: latitude, lng: longitude };
          const lastPoint = prev.path[prev.path.length - 1];
          let newDistance = prev.distance;
          
          if (lastPoint) {
            newDistance += calculateDistance(lastPoint.lat, lastPoint.lng, latitude, longitude);
          }

          return {
            ...prev,
            distance: newDistance,
            path: [...prev.path, newPoint]
          };
        });
      },
      (error) => console.error(error),
      { enableHighAccuracy: true }
    );
    setWatchId(id);
  };

  const pauseTracking = () => {
    if (!isTracking || isPaused) return;
    setIsPaused(true);
    const sessionDuration = Math.floor((Date.now() - (currentRun.startTime || Date.now())) / 1000);
    const totalDuration = accumulatedTime + sessionDuration;
    setAccumulatedTime(totalDuration);
    setCurrentRun(prev => ({ ...prev, startTime: null, duration: totalDuration }));
  };

  const resumeTracking = () => {
    if (!isTracking || !isPaused) return;
    setIsPaused(false);
    setCurrentRun(prev => ({ ...prev, startTime: Date.now() }));
  };

  const stopTracking = async () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    
    const finalDuration = accumulatedTime + (currentRun.startTime ? Math.floor((Date.now() - currentRun.startTime) / 1000) : 0);
    setIsTracking(false);
    setIsPaused(false);
    setAccumulatedTime(0);

    const pace = currentRun.distance > 0 ? (finalDuration / 60 / currentRun.distance).toFixed(2) : "0:00";

    const activity = {
      distance: Number(currentRun.distance.toFixed(2)),
      duration: finalDuration,
      pace: pace.replace('.', ':'),
      path: currentRun.path,
      notes: "",
      communityId: selectedCommunityId,
      activityType: activityType
    };

    setSummaryActivity(activity);
    setShowSummaryModal(true);
  };

  const handlePublishActivity = async () => {
    if (!summaryActivity) return;

    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summaryActivity)
    });
    const data = await res.json();
    if (data.success) {
      setActivities([data.activity, ...activities]);
      fetch(`/api/profile/${user?.email}`).then(res => res.json()).then(setProfile);
      setShowSummaryModal(false);
      setSummaryActivity(null);
      setCurrentRun({ distance: 0, duration: 0, path: [], startTime: null });
      setActiveTab('feed');
    }
  };

  useEffect(() => {
    let interval: any;
    if (isTracking && !isPaused) {
      interval = setInterval(() => {
        setCurrentRun(prev => ({
          ...prev,
          duration: accumulatedTime + Math.floor((Date.now() - (prev.startTime || Date.now())) / 1000)
        }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, isPaused, accumulatedTime]);

  const handleLike = async (id: string) => {
    const res = await fetch(`/api/activities/${id}/like`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setActivities(activities.map(a => a.id === id ? { ...a, likes: data.likes } : a));
    }
  };

  const handleComment = async (id: string) => {
    if (!commentText[id]?.trim()) return;
    const res = await fetch(`/api/activities/${id}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: commentText[id] })
    });
    const data = await res.json();
    if (data.success) {
      setActivities(activities.map(a => a.id === id ? { ...a, comments: [...a.comments, data.comment] } : a));
      setCommentText({ ...commentText, [id]: "" });
    }
  };

  const handleFollow = async (email: string) => {
    const res = await fetch(`/api/profile/${email}/follow`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      fetch(`/api/profile/${email}`).then(res => res.json()).then(setProfile);
    }
  };

  const handleUnfollow = async (email: string) => {
    const res = await fetch(`/api/profile/${email}/unfollow`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      fetch(`/api/profile/${email}`).then(res => res.json()).then(setProfile);
    }
  };

  const handleCompleteWorkout = async (id: string) => {
    const res = await fetch(`/api/workouts/${id}/complete`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setProfile(prev => prev ? { ...prev, completedWorkouts: data.completedWorkouts } : null);
    }
  };

  const getDynamicStats = (): UserStats => {
    const userActivities = activities.filter(a => a.userEmail === user?.email);
    const totalDistance = userActivities.reduce((acc, a) => acc + a.distance, 0);
    const totalTime = userActivities.reduce((acc, a) => acc + a.duration, 0);
    
    // Last 7 days progress
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weeklyProgress = days.map((day, i) => {
      const dayActivities = userActivities.filter(a => new Date(a.date).getDay() === i);
      return { day, distance: dayActivities.reduce((acc, a) => acc + a.distance, 0) };
    });

    return {
      totalDistance: Number(totalDistance.toFixed(1)),
      totalTime: Math.floor(totalTime / 60),
      averagePace: totalDistance > 0 ? (totalTime / 60 / totalDistance).toFixed(2).replace('.', ':') : "0:00",
      weeklyProgress
    };
  };

  const dynamicStats = getDynamicStats();

  const handleGeneratePlan = async () => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setIsGenerating(true);
    const newPlan = await generateTrainingPlan(generatorData.goal, generatorData.level, generatorData.days);
    if (newPlan) {
      await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlan)
      });
      setPlans([...plans, newPlan]);
      setShowGeneratorModal(false);
    }
    setIsGenerating(false);
    setActiveTab('dashboard');
  };

  const handleStartCheckout = async () => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    const res = await fetch('/api/payment/pix', { method: 'POST' });
    const data = await res.json();
    setPixData(data);
    setShowCheckout(true);
  };

  const handleConfirmPayment = async () => {
    setIsConfirmingPayment(true);
    // Simulate network delay for verification
    setTimeout(async () => {
      const res = await fetch('/api/payment/confirm', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setHasPurchased(true);
        setEbookUrl(data.ebookUrl);
        setShowCheckout(false);
        setPixData(null);
        alert("Pagamento confirmado! O link de download foi liberado e enviado para seu email.");
      }
      setIsConfirmingPayment(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-orange-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/20">
              <Zap className="text-white fill-white" size={24} />
            </div>
            <span className="text-2xl font-bold tracking-tighter">STRIDE<span className="text-orange-600">FLOW</span></span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => setActiveTab('home')} className={cn("text-sm font-medium transition-colors hover:text-orange-500", activeTab === 'home' ? "text-orange-500" : "text-white/60")}>Início</button>
            <button onClick={() => setActiveTab('dashboard')} className={cn("text-sm font-medium transition-colors hover:text-orange-500", activeTab === 'dashboard' ? "text-orange-500" : "text-white/60")}>Treinos</button>
            <button onClick={() => setActiveTab('run')} className={cn("text-sm font-medium transition-colors hover:text-orange-500", activeTab === 'run' ? "text-orange-500" : "text-white/60")}>Correr</button>
            <button onClick={() => setActiveTab('feed')} className={cn("text-sm font-medium transition-colors hover:text-orange-500", activeTab === 'feed' ? "text-orange-500" : "text-white/60")}>Feed</button>
            <button onClick={() => setActiveTab('communities')} className={cn("text-sm font-medium transition-colors hover:text-orange-500", activeTab === 'communities' ? "text-orange-500" : "text-white/60")}>Comunidades</button>
            <button onClick={() => setActiveTab('ebook')} className={cn("text-sm font-medium transition-colors hover:text-orange-500", activeTab === 'ebook' ? "text-orange-500" : "text-white/60")}>Ebook</button>
            {user?.isAdmin && (
              <button onClick={() => setActiveTab('admin')} className={cn("text-sm font-medium transition-colors hover:text-orange-500 flex items-center gap-1", activeTab === 'admin' ? "text-orange-500" : "text-white/60")}>
                <ShieldCheck size={16} /> Admin
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-xs text-white/40 hidden sm:block">{user.email}</span>
                <button onClick={handleLogout} className="p-2 text-white/60 hover:text-red-500 transition-colors">
                  <LogOut size={20} />
                </button>
                <button onClick={() => setActiveTab('profile')} className={cn("w-10 h-10 rounded-full border flex items-center justify-center overflow-hidden transition-all", activeTab === 'profile' ? "border-orange-500 ring-2 ring-orange-500/20" : "border-white/20 hover:border-white/40")}>
                  <User size={20} className={cn("transition-colors", activeTab === 'profile' ? "text-orange-500" : "text-white/60")} />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowLoginModal(true)} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all">
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-20">
        <AnimatePresence mode="wait">
          {activeTab === 'run' && (
            <motion.div key="run" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="px-6 py-12 max-w-4xl mx-auto">
              <div className="bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-orange-600/5 blur-3xl" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-600/10 border border-orange-600/20 text-orange-500 text-xs font-bold uppercase tracking-widest mb-8">
                    <Navigation size={14} className={isTracking && !isPaused ? "animate-pulse" : ""} /> {isTracking ? (isPaused ? "Corrida Pausada" : "Gravando Corrida") : "Pronto para Correr"}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-12 mb-12">
                    <div>
                      <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-2">Distância</p>
                      <p className="text-7xl font-black tracking-tighter">{currentRun.distance.toFixed(2)}<span className="text-2xl text-white/20 ml-2">km</span></p>
                    </div>
                    <div>
                      <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-2">Tempo</p>
                      <p className="text-7xl font-black tracking-tighter font-mono">{formatDuration(currentRun.duration)}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-8 mb-12">
                    {!isTracking && (
                      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Modalidade</label>
                          <select 
                            value={activityType} 
                            onChange={e => setActivityType(e.target.value as ActivityType)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors appearance-none"
                          >
                            <option value="Corrida">Corrida</option>
                            <option value="Caminhada">Caminhada</option>
                            <option value="Ciclismo">Ciclismo</option>
                            <option value="Natação">Natação</option>
                            <option value="Trilha">Trilha</option>
                          </select>
                        </div>
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Postar na Comunidade (Opcional)</label>
                          <select 
                            value={selectedCommunityId || ""} 
                            onChange={e => setSelectedCommunityId(e.target.value || undefined)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors appearance-none"
                          >
                            <option value="">Nenhuma (Feed Geral)</option>
                            {communities.filter(c => c.members.includes(user?.email || "")).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-center gap-6">
                      {!isTracking ? (
                        <button onClick={startTracking} className="w-24 h-24 rounded-full bg-orange-600 hover:bg-orange-700 flex items-center justify-center shadow-2xl shadow-orange-600/40 transition-all hover:scale-110 active:scale-95">
                          <Play size={40} className="fill-white ml-1" />
                        </button>
                      ) : (
                        <>
                          {isPaused ? (
                            <button onClick={resumeTracking} className="w-24 h-24 rounded-full bg-orange-600 hover:bg-orange-700 flex items-center justify-center shadow-2xl shadow-orange-600/40 transition-all hover:scale-110 active:scale-95">
                              <Play size={40} className="fill-white ml-1" />
                            </button>
                          ) : (
                            <button onClick={pauseTracking} className="w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center border border-white/10 transition-all hover:scale-110 active:scale-95">
                              <Pause size={40} className="text-white" />
                            </button>
                          )}
                          <button onClick={stopTracking} className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-2xl shadow-red-600/40 transition-all hover:scale-110 active:scale-95">
                            <Square size={40} className="fill-white" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {currentRun.path.length > 0 && (
                    <div className="mt-12 p-6 bg-white/5 rounded-3xl border border-white/10">
                      <div className="flex items-center justify-between text-xs font-bold text-white/40 uppercase tracking-widest">
                        <span>Pace Atual</span>
                        <span>{currentRun.distance > 0 ? (currentRun.duration / 60 / currentRun.distance).toFixed(2).replace('.', ':') : "0:00"} min/km</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'communities' && (
            <motion.div key="communities" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12 max-w-6xl mx-auto space-y-12">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-4xl font-black tracking-tighter mb-2">COMUNIDADES</h2>
                  <p className="text-white/40 font-medium uppercase tracking-[0.2em] text-[10px]">Conecte-se com outros corredores</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                    <input 
                      placeholder="Buscar grupos..." 
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors" 
                    />
                  </div>
                  <button onClick={() => setShowCreateCommunityModal(true)} className="p-4 bg-orange-600 rounded-2xl hover:bg-orange-700 transition-all shadow-lg shadow-orange-600/20 active:scale-95">
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {communities.map((community) => (
                  <motion.div 
                    key={community.id} 
                    whileHover={{ y: -5 }}
                    className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 hover:border-orange-500/30 transition-all group cursor-pointer"
                    onClick={() => { setSelectedCommunity(community); setActiveTab('communities'); }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-orange-600/10 flex items-center justify-center text-orange-500 group-hover:bg-orange-600 group-hover:text-white transition-all">
                        <Users size={28} />
                      </div>
                      <div className="flex -space-x-3">
                        {community.members.slice(0, 3).map((m, i) => (
                          <div key={i} className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0A0A0A] flex items-center justify-center text-[8px] font-bold uppercase">
                            {m[0]}
                          </div>
                        ))}
                        {community.members.length > 3 && (
                          <div className="w-8 h-8 rounded-full bg-white/5 border-2 border-[#0A0A0A] flex items-center justify-center text-[8px] font-bold text-white/40">
                            +{community.members.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-orange-500 transition-colors">{community.name}</h3>
                    <p className="text-sm text-white/40 line-clamp-2 mb-8 leading-relaxed">{community.description}</p>
                    
                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">Membros</p>
                          <p className="text-sm font-bold">{community.members.length}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">Eventos</p>
                          <p className="text-sm font-bold">{community.events.length}</p>
                        </div>
                      </div>
                      {community.members.includes(user?.email || "") ? (
                        <button onClick={(e) => { e.stopPropagation(); handleLeaveCommunity(community.id); }} className="px-6 py-2 bg-white/5 hover:bg-red-500/10 hover:text-red-500 rounded-xl text-xs font-bold transition-all border border-white/5">Sair</button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleJoinCommunity(community.id); }} className="px-6 py-2 bg-orange-600 hover:bg-orange-700 rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-600/10">Entrar</button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {selectedCommunity && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="pt-12 border-t border-white/10">
                  <div className="grid lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2 space-y-8">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-bold tracking-tight">Atividades do Grupo</h3>
                        <div className="flex items-center gap-2">
                          <button className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-6">
                        {activities.filter(a => a.communityId === selectedCommunity.id).length > 0 ? (
                          activities.filter(a => a.communityId === selectedCommunity.id).map(activity => (
                            <div key={activity.id} className="bg-white/5 border border-white/10 rounded-3xl p-8">
                              {/* Activity content similar to feed */}
                              <div className="flex items-center gap-4 mb-6">
                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">{activity.userName[0]}</div>
                                <div>
                                  <p className="font-bold text-sm">{activity.userName}</p>
                                  <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{new Date(activity.date).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="text-center">
                                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Distância</p>
                                  <p className="text-xl font-bold">{activity.distance}km</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Tempo</p>
                                  <p className="text-xl font-bold">{formatDuration(activity.duration)}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Pace</p>
                                  <p className="text-xl font-bold">{activity.pace}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6 pt-6 border-t border-white/5">
                                <button onClick={() => handleLike(activity.id)} className={cn("flex items-center gap-2 text-sm transition-colors", activity.likes.includes(user?.email || "") ? "text-orange-500" : "text-white/40 hover:text-white")}>
                                  <Heart size={18} className={activity.likes.includes(user?.email || "") ? "fill-orange-500" : ""} />
                                  <span>{activity.likes.length}</span>
                                </button>
                                <button className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                                  <MessageSquare size={18} />
                                  <span>{activity.comments.length}</span>
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center">
                            <Activity size={48} className="mx-auto mb-4 text-white/10" />
                            <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Nenhuma atividade postada ainda</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                        <div className="flex items-center justify-between mb-8">
                          <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Próximos Eventos</h4>
                          {selectedCommunity.creatorEmail === user?.email && (
                            <button onClick={() => setShowCreateEventModal(true)} className="p-2 bg-orange-600 rounded-xl hover:bg-orange-700 transition-colors">
                              <Plus size={14} />
                            </button>
                          )}
                        </div>
                        <div className="space-y-6">
                          {selectedCommunity.events.length > 0 ? (
                            selectedCommunity.events.map(event => (
                              <div key={event.id} className="group cursor-pointer">
                                <div className="flex gap-4">
                                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex flex-col items-center justify-center border border-white/10 group-hover:bg-orange-600 group-hover:border-orange-600 transition-all">
                                    <span className="text-[10px] font-bold uppercase text-white/40 group-hover:text-white/60">{new Date(event.date).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                                    <span className="text-lg font-black leading-none">{new Date(event.date).getDate()}</span>
                                  </div>
                                  <div className="flex-1">
                                    <h5 className="font-bold text-sm mb-1 group-hover:text-orange-500 transition-colors">{event.title}</h5>
                                    <div className="flex items-center gap-2 text-[10px] text-white/40 font-bold uppercase tracking-widest">
                                      <MapPin size={10} /> {event.location}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-white/20 italic">Sem eventos programados</p>
                          )}
                        </div>
                      </div>

                      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                        <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Membros Ativos</h4>
                        <div className="space-y-4">
                          {selectedCommunity.members.slice(0, 5).map((member, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold uppercase">{member[0]}</div>
                              <p className="text-xs font-bold">{member.split('@')[0]}</p>
                            </div>
                          ))}
                          {selectedCommunity.members.length > 5 && (
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest pt-2">E mais {selectedCommunity.members.length - 5} corredores</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'feed' && (
            <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12 max-w-2xl mx-auto space-y-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Comunidade</h2>
                <button onClick={() => setActiveTab('run')} className="p-3 bg-orange-600 rounded-2xl hover:bg-orange-700 transition-colors">
                  <Plus size={20} />
                </button>
              </div>

              {activities.map((activity) => (
                <motion.div key={activity.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden">
                  <div className="p-6 flex items-center gap-4 border-b border-white/5">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <User size={20} className="text-white/40" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{activity.userName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-orange-500 font-bold uppercase tracking-widest bg-orange-500/10 px-2 py-0.5 rounded-full">{activity.activityType || 'Corrida'}</span>
                        <span className="text-white/20">•</span>
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{new Date(activity.date).toLocaleDateString()}</p>
                        {activity.communityId && (
                          <>
                            <span className="text-white/20">•</span>
                            <span className="text-[10px] text-orange-500 font-bold uppercase tracking-widest flex items-center gap-1">
                              <Users size={10} /> {communities.find(c => c.id === activity.communityId)?.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-8">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="text-center">
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Distância</p>
                        <p className="text-xl font-bold">{activity.distance}km</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Tempo</p>
                        <p className="text-xl font-bold">{formatDuration(activity.duration)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Pace</p>
                        <p className="text-xl font-bold">{activity.pace}</p>
                      </div>
                    </div>
                    
                    {activity.notes && <p className="text-sm text-white/60 italic mb-6">"{activity.notes}"</p>}
                    
                    <div className="flex items-center gap-6 pt-6 border-t border-white/5">
                      <button onClick={() => handleLike(activity.id)} className={cn("flex items-center gap-2 text-sm transition-colors", activity.likes.includes(user?.email || "") ? "text-orange-500" : "text-white/40 hover:text-white")}>
                        <Heart size={18} className={activity.likes.includes(user?.email || "") ? "fill-orange-500" : ""} />
                        <span>{activity.likes.length}</span>
                      </button>
                      <button className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                        <MessageSquare size={18} />
                        <span>{activity.comments.length}</span>
                      </button>
                      <button onClick={() => { setSelectedActivity(activity); setShowActivityModal(true); }} className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                        <Maximize2 size={18} />
                      </button>
                      <button className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors ml-auto">
                        <Share2 size={18} />
                      </button>
                    </div>

                    {/* Comments Section */}
                    <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                      {activity.comments.map(comment => (
                        <div key={comment.id} className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[8px] font-bold">
                            {comment.userName[0]}
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold">{comment.userName} <span className="font-normal text-white/40 ml-2">{new Date(comment.date).toLocaleDateString()}</span></p>
                            <p className="text-xs text-white/60">{comment.text}</p>
                          </div>
                        </div>
                      ))}
                      
                      {user && (
                        <div className="flex gap-2 mt-4">
                          <input 
                            value={commentText[activity.id] || ""} 
                            onChange={e => setCommentText({ ...commentText, [activity.id]: e.target.value })}
                            placeholder="Adicione um comentário..." 
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-orange-500 transition-colors" 
                          />
                          <button onClick={() => handleComment(activity.id)} className="p-2 bg-orange-600 rounded-xl hover:bg-orange-700 transition-colors">
                            <Send size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {activeTab === 'profile' && profile && (
            <motion.div key="profile" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="px-6 py-12 max-w-4xl mx-auto">
              <div className="grid lg:grid-cols-3 gap-12">
                <div className="lg:col-span-1 space-y-8">
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 text-center">
                    <div className="w-32 h-32 rounded-full bg-white/10 border-4 border-orange-600/20 mx-auto mb-6 flex items-center justify-center overflow-hidden">
                      <User size={64} className="text-white/20" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{profile.displayName}</h3>
                    <p className="text-sm text-white/40 mb-6">{profile.email}</p>
                    <div className="flex justify-center gap-8 border-t border-white/5 pt-6 mb-6">
                      <div className="text-center">
                        <p className="text-xl font-bold">{profile.followers.length}</p>
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Seguidores</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{profile.following.length}</p>
                        <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Seguindo</p>
                      </div>
                    </div>

                    {user && user.email !== profile.email && (
                      <button 
                        onClick={() => profile.followers.includes(user.email) ? handleUnfollow(profile.email) : handleFollow(profile.email)}
                        className={cn("w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2", 
                          profile.followers.includes(user.email) ? "bg-white/5 border border-white/10 hover:bg-white/10" : "bg-orange-600 hover:bg-orange-700")}
                      >
                        {profile.followers.includes(user.email) ? (
                          <><UserMinus size={18} /> Deixar de Seguir</>
                        ) : (
                          <><UserPlus size={18} /> Seguir</>
                        )}
                      </button>
                    )}

                    {user && user.email === profile.email && (
                      <button onClick={() => { setEditProfileData({ displayName: profile.displayName, bio: profile.bio || "" }); setShowEditProfileModal(true); }} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                        <Settings size={18} /> Editar Perfil
                      </button>
                    )}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                    <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Bio</h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      {profile.bio || "Nenhuma bio adicionada ainda. Conte-nos sobre sua jornada na corrida!"}
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-8">
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    {[
                      { type: '5k', label: 'Iniciante 5K' },
                      { type: '10k', label: 'Intermediário 10K' },
                      { type: '21k', label: 'Meia Maratona' },
                    ].map((p) => (
                      <button 
                        key={p.type}
                        onClick={() => handleQuickPlan(p.type as any)}
                        className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-orange-500/50 transition-all text-center group"
                      >
                        <Zap size={20} className="mx-auto mb-2 text-white/20 group-hover:text-orange-500 transition-colors" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">{p.label}</p>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
                        <TrendingUp size={20} />
                      </div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Distância Total</p>
                      <p className="text-3xl font-bold">{profile.totalDistance.toFixed(1)}km</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4">
                        <Award size={20} />
                      </div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Total de Corridas</p>
                      <p className="text-3xl font-bold">{profile.totalRuns}</p>
                    </div>
                  </div>

                  <h4 className="text-xl font-bold tracking-tight mb-6">Minhas Atividades</h4>
                  <div className="space-y-6">
                    {activities.filter(a => a.userEmail === user?.email).map(activity => (
                      <div key={activity.id} className="bg-white/5 border border-white/10 rounded-3xl p-6 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/20">
                            <MapPin size={24} />
                          </div>
                          <div>
                            <p className="font-bold">{activity.distance}km - {activity.pace} min/km</p>
                            <p className="text-xs text-white/40">{new Date(activity.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1 text-xs text-white/40">
                            <Heart size={14} className={activity.likes.includes(user?.email || "") ? "text-orange-500 fill-orange-500" : ""} />
                            {activity.likes.length}
                          </div>
                          <ChevronRight size={20} className="text-white/20" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="px-6 py-20 max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-600/10 border border-orange-600/20 text-orange-500 text-xs font-bold uppercase tracking-widest mb-6">
                    <Flame size={14} /> Evolua sua corrida
                  </motion.div>
                  <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8">
                    {config.heroTitle.split(' ').map((word, i) => (
                      <span key={i} className={i === config.heroTitle.split(' ').length - 1 ? "text-orange-600" : ""}>{word} </span>
                    ))}
                  </h1>
                  <p className="text-xl text-white/60 max-w-lg mb-10 leading-relaxed">
                    Planos de treino personalizados gerados por IA, análise de performance em tempo real e o guia definitivo para sua primeira maratona.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <button onClick={() => setShowGeneratorModal(true)} disabled={isGenerating} className="px-8 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all flex items-center gap-2 group disabled:opacity-50">
                      {isGenerating ? "Gerando Plano..." : "Começar Agora"}
                      <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button onClick={() => setActiveTab('ebook')} className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-2xl transition-all">
                      Ver Ebook
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 bg-orange-600/20 blur-[120px] rounded-full" />
                  <img src="https://images.unsplash.com/photo-1552674605-db6ffd4facb5?q=80&w=2070&auto=format&fit=crop" alt="Runner" className="relative rounded-3xl border border-white/10 shadow-2xl grayscale hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12 max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight">Dashboard de Treino</h2>
                  <p className="text-white/40">Acompanhe sua evolução e próximos desafios.</p>
                </div>
                <button onClick={() => setShowGeneratorModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all">
                  <Plus size={18} /> Novo Plano
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {[
                  { label: 'Distância Total', value: `${dynamicStats.totalDistance} km`, icon: Activity, color: 'text-blue-500' },
                  { label: 'Tempo Total', value: `${Math.floor(dynamicStats.totalTime / 60)}h ${dynamicStats.totalTime % 60}m`, icon: Calendar, color: 'text-orange-500' },
                  { label: 'Ritmo Médio', value: `${dynamicStats.averagePace} min/km`, icon: Zap, color: 'text-yellow-500' },
                  { label: 'Conquistas', value: activities.filter(a => a.userEmail === user?.email).length.toString(), icon: Trophy, color: 'text-purple-500' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-3xl hover:border-white/20 transition-all">
                    <div className={cn("w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4", stat.color)}>
                      <stat.icon size={20} />
                    </div>
                    <p className="text-xs text-white/40 font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  {todayWorkout && (
                    <div className="bg-orange-600/10 border border-orange-600/20 p-8 rounded-3xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <Flame size={120} />
                      </div>
                      <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-600/20 text-orange-500 text-[10px] font-bold uppercase tracking-widest">
                            Treino de Hoje
                          </div>
                          <button 
                            onClick={() => handleCompleteWorkout(todayWorkout.id)}
                            className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-all", 
                              profile?.completedWorkouts?.includes(todayWorkout.id) ? "bg-green-600 text-white" : "bg-white/10 text-white/40 hover:bg-white/20")}
                          >
                            <CheckCircle2 size={20} />
                          </button>
                        </div>
                        <h3 className="text-3xl font-bold mb-2">{todayWorkout.type}</h3>
                        <p className="text-white/60 mb-6 max-w-md">{todayWorkout.notes}</p>
                        <div className="flex gap-8">
                          <div>
                            <p className="text-xs text-white/40 font-bold uppercase mb-1">Distância</p>
                            <p className="text-xl font-bold">{todayWorkout.distance} km</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40 font-bold uppercase mb-1">Duração</p>
                            <p className="text-xl font-bold">{todayWorkout.duration} min</p>
                          </div>
                          <div>
                            <p className="text-xs text-white/40 font-bold uppercase mb-1">Intensidade</p>
                            <p className="text-xl font-bold">{todayWorkout.intensity}/10</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {plans.length > 0 ? (
                    plans.map((p, idx) => (
                      <div key={idx} className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                        <h3 className="text-xl font-bold mb-6 flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Activity size={20} className="text-orange-500" /> {p.name}
                          </span>
                          <span className="text-xs text-white/40 font-normal">{p.workouts.length} treinos</span>
                        </h3>
                        <div className="space-y-4">
                          {p.workouts.slice(0, 3).map((w, wIdx) => (
                            <div key={wIdx} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                              <div className="flex items-center gap-4">
                                <button 
                                  onClick={() => handleCompleteWorkout(w.id)}
                                  className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-all", 
                                    profile?.completedWorkouts?.includes(w.id) ? "bg-green-600 text-white" : "bg-orange-600/10 text-orange-500 font-bold")}
                                >
                                  {profile?.completedWorkouts?.includes(w.id) ? <CheckCircle2 size={20} /> : w.type[0]}
                                </button>
                                <div>
                                  <p className={cn("font-bold", profile?.completedWorkouts?.includes(w.id) && "line-through text-white/20")}>{w.type} - {w.distance}km</p>
                                  <p className="text-xs text-white/40">{w.notes}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">{w.duration} min</p>
                                <p className="text-xs text-white/40">Intensidade: {w.intensity}/10</p>
                              </div>
                            </div>
                          ))}
                          <button 
                            onClick={() => { setSelectedPlan(p); setShowPlanModal(true); }}
                            className="w-full py-3 text-sm text-white/40 hover:text-white transition-colors border border-dashed border-white/10 rounded-xl hover:border-white/20"
                          >
                            Ver plano completo
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-white/5 border border-white/10 p-12 rounded-3xl text-center">
                      <Zap size={48} className="mx-auto mb-4 text-white/20" />
                      <p className="text-white/40">Você ainda não tem planos de treino. Gere um agora!</p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-8">
                  <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <LineChart size={20} className="text-orange-500" /> Progresso Semanal
                    </h3>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ReLineChart data={dynamicStats.weeklyProgress}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="day" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }} itemStyle={{ color: '#EA580C' }} />
                          <Line type="monotone" dataKey="distance" stroke="#EA580C" strokeWidth={3} dot={{ fill: '#EA580C', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        </ReLineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'ebook' && (
            <motion.div key="ebook" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="px-6 py-20 max-w-7xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-20 items-center">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-orange-600/30 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative aspect-[3/4] bg-gradient-to-br from-orange-600 to-orange-800 rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col items-center justify-center p-12 text-center">
                    <Book size={120} className="mb-8 text-white/20" />
                    <h3 className="text-5xl font-black tracking-tighter leading-none mb-4 uppercase italic">O Guia <br /> Definitivo <br /> <span className="text-black">da Maratona</span></h3>
                  </div>
                </div>
                <div>
                  <h2 className="text-5xl font-bold tracking-tighter mb-6">DOMINE OS 42.195KM</h2>
                  <p className="text-xl text-white/60 mb-8 leading-relaxed">Tudo o que você precisa saber para cruzar a linha de chegada.</p>
                  {!hasPurchased ? (
                    <div className="bg-white/5 border border-white/10 p-8 rounded-3xl">
                      <div className="flex items-end gap-2 mb-6">
                        <span className="text-4xl font-bold">R$ {config.ebookPrice.toFixed(2)}</span>
                      </div>
                      <button onClick={handleStartCheckout} className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                        <ShoppingBag size={20} /> Comprar Agora (PIX)
                      </button>
                    </div>
                  ) : (
                    <div className="bg-green-500/10 border border-green-500/20 p-8 rounded-3xl text-center">
                      <CheckCircle2 className="text-green-500 mx-auto mb-4" size={48} />
                      <h3 className="text-2xl font-bold mb-2">Acesso Liberado!</h3>
                      <p className="text-sm text-white/60 mb-6">O link também foi enviado para seu email.</p>
                      <a href={ebookUrl} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                        <Download size={20} /> Baixar Ebook (PDF)
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'admin' && user?.isAdmin && (
            <motion.div key="admin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-6 py-20 max-w-3xl mx-auto">
              <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem]">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Painel Administrativo</h2>
                    <p className="text-white/40">Modifique as configurações globais do site.</p>
                  </div>
                </div>

                <form onSubmit={handleUpdateConfig} className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Título Principal (Hero)</label>
                    <input name="heroTitle" defaultValue={config.heroTitle} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Preço do Ebook (R$)</label>
                    <input name="ebookPrice" type="number" step="0.01" defaultValue={config.ebookPrice} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Link do Arquivo PDF (Ebook)</label>
                    <input name="ebookUrl" defaultValue={config.ebookUrl} placeholder="https://..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" />
                  </div>
                  
                  <div className="pt-4">
                    <button type="submit" className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                      <Save size={20} /> Salvar Alterações
                    </button>
                  </div>
                </form>

                <div className="mt-12 pt-12 border-t border-white/10">
                  <h3 className="text-lg font-bold mb-6">Vendas Recentes</h3>
                  <div className="space-y-4">
                    {recentPurchases.length > 0 ? (
                      recentPurchases.map((purchase, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                              <CheckCircle2 size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold">{purchase.email}</p>
                              <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{new Date(purchase.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-green-500">R$ {purchase.amount.toFixed(2)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-white/40 text-center py-4 italic">Nenhuma venda registrada ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Activity Details Modal */}
      <AnimatePresence>
        {showActivityModal && selectedActivity && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowActivityModal(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-4xl bg-[#111] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col lg:flex-row h-[80vh]">
              <div className="flex-1 relative">
                <MapComponent path={selectedActivity.path} className="h-full rounded-none border-0" />
                <button onClick={() => setShowActivityModal(false)} className="absolute top-6 left-6 z-[1000] p-3 bg-black/50 backdrop-blur-xl rounded-full border border-white/10 hover:bg-black/70 transition-colors">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>
              <div className="w-full lg:w-80 bg-white/5 p-8 overflow-y-auto border-l border-white/10 flex flex-col">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                    <User size={24} className="text-white/20" />
                  </div>
                  <div>
                    <h3 className="font-bold">{selectedActivity.userName}</h3>
                    <p className="text-xs text-white/40">{new Date(selectedActivity.date).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="space-y-6 mb-8">
                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Modalidade</p>
                    <p className="text-xl font-bold text-orange-500">{selectedActivity.activityType || 'Corrida'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Distância</p>
                    <p className="text-3xl font-bold">{selectedActivity.distance}km</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Tempo</p>
                      <p className="text-xl font-bold">{formatDuration(selectedActivity.duration)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Pace</p>
                      <p className="text-xl font-bold">{selectedActivity.pace}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1">
                  <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Comentários</h4>
                  <div className="space-y-4">
                    {selectedActivity.comments.map(comment => (
                      <div key={comment.id} className="text-xs">
                        <p className="font-bold">{comment.userName}</p>
                        <p className="text-white/60">{comment.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-white/10">
                  <div className="flex items-center gap-4">
                    <button onClick={() => handleLike(selectedActivity.id)} className={cn("flex items-center gap-2 text-sm", selectedActivity.likes.includes(user?.email || "") ? "text-orange-500" : "text-white/40")}>
                      <Heart size={18} className={selectedActivity.likes.includes(user?.email || "") ? "fill-orange-500" : ""} />
                      {selectedActivity.likes.length}
                    </button>
                    <button className="flex items-center gap-2 text-sm text-white/40 ml-auto">
                      <Share2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Community Modal */}
      <AnimatePresence>
        {showCreateCommunityModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateCommunityModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-bold mb-8 text-center">Criar Comunidade</h3>
              <form onSubmit={handleCreateCommunity} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Nome da Comunidade</label>
                  <input 
                    required
                    value={newCommunity.name} 
                    onChange={e => setNewCommunity({...newCommunity, name: e.target.value})}
                    placeholder="Ex: Corredores de Elite" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Descrição</label>
                  <textarea 
                    required
                    value={newCommunity.description} 
                    onChange={e => setNewCommunity({...newCommunity, description: e.target.value})}
                    rows={4}
                    placeholder="Conte sobre o propósito do grupo..." 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors resize-none" 
                  />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setShowCreateCommunityModal(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20">
                    Criar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Event Modal */}
      <AnimatePresence>
        {showCreateEventModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateEventModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-bold mb-8 text-center">Novo Evento</h3>
              <form onSubmit={handleCreateEvent} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Título do Evento</label>
                  <input 
                    required
                    value={newEvent.title} 
                    onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                    placeholder="Ex: Treino Coletivo no Parque" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Data</label>
                  <input 
                    required
                    type="date"
                    value={newEvent.date} 
                    onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors appearance-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Localização</label>
                  <input 
                    required
                    value={newEvent.location} 
                    onChange={e => setNewEvent({...newEvent, location: e.target.value})}
                    placeholder="Ex: Parque Ibirapuera" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Descrição</label>
                  <textarea 
                    required
                    value={newEvent.description} 
                    onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                    rows={3}
                    placeholder="Detalhes do evento..." 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors resize-none" 
                  />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setShowCreateEventModal(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20">
                    Agendar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditProfileModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditProfileModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-bold mb-8 text-center">Editar Perfil</h3>
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Nome de Exibição</label>
                  <input 
                    value={editProfileData.displayName} 
                    onChange={e => setEditProfileData({...editProfileData, displayName: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Bio</label>
                  <textarea 
                    value={editProfileData.bio} 
                    onChange={e => setEditProfileData({...editProfileData, bio: e.target.value})}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors resize-none" 
                  />
                </div>
                <div className="pt-4 flex gap-4">
                  <button type="button" onClick={() => setShowEditProfileModal(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all">
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Plan Generator Modal */}
      <AnimatePresence>
        {showGeneratorModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGeneratorModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-bold mb-8 text-center">Personalize seu Plano</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Qual seu objetivo?</label>
                  <input 
                    value={generatorData.goal} 
                    onChange={e => setGeneratorData({...generatorData, goal: e.target.value})}
                    placeholder="Ex: Correr 5km em 25 min" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Nível Atual</label>
                  <select 
                    value={generatorData.level} 
                    onChange={e => setGeneratorData({...generatorData, level: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors appearance-none"
                  >
                    <option value="Iniciante">Iniciante</option>
                    <option value="Intermediário">Intermediário</option>
                    <option value="Avançado">Avançado</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Dias por Semana</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="7" 
                    value={generatorData.days} 
                    onChange={e => setGeneratorData({...generatorData, days: parseInt(e.target.value)})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 transition-colors" 
                  />
                </div>
                <div className="pt-4">
                  <button onClick={handleGeneratePlan} disabled={isGenerating} className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                    {isGenerating ? "Gerando..." : "Gerar Plano com IA"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Plan Details Modal */}
      <AnimatePresence>
        {showPlanModal && selectedPlan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPlanModal(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-2xl bg-[#111] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div>
                  <h3 className="text-2xl font-bold">{selectedPlan.name}</h3>
                  <p className="text-white/40 text-sm">Plano completo de treinamento</p>
                </div>
                <button onClick={() => setShowPlanModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto space-y-4">
                {selectedPlan.workouts.map((w, i) => (
                  <div key={i} className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/20 transition-all">
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={() => handleCompleteWorkout(w.id)}
                        className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all text-xl", 
                          profile?.completedWorkouts?.includes(w.id) ? "bg-green-600 text-white" : "bg-orange-600/10 text-orange-500 font-bold")}
                      >
                        {profile?.completedWorkouts?.includes(w.id) ? <CheckCircle2 size={24} /> : i + 1}
                      </button>
                      <div>
                        <p className={cn("text-lg font-bold", profile?.completedWorkouts?.includes(w.id) && "line-through text-white/20")}>{w.type}</p>
                        <p className="text-sm text-white/60">{w.notes}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-orange-500">{w.distance} km</p>
                      <p className="text-sm text-white/40">{w.duration} min</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-8 border-t border-white/10 bg-white/5">
                <button onClick={() => setShowPlanModal(false)} className="w-full py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all">
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowLoginModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-bold mb-8 text-center">Entrar no StrideFlow</h3>
              <div className="space-y-4">
                <button onClick={() => handleLogin('google')} className="w-full py-4 bg-white text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-3 hover:bg-gray-200">
                  <Mail size={20} /> Continuar com Google
                </button>
                <button onClick={() => handleLogin('facebook')} className="w-full py-4 bg-[#1877F2] text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 hover:bg-[#166fe5]">
                  <Facebook size={20} /> Continuar com Facebook
                </button>
                <button onClick={() => handleLogin('mock')} className="w-full py-3 text-white/20 hover:text-white/40 text-xs font-bold uppercase tracking-widest transition-colors">
                  Entrar como Admin (Simulação)
                </button>
              </div>
              <p className="text-center text-xs text-white/20 mt-8 uppercase tracking-widest">Acesso seguro via OAuth 2.0</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Checkout Modal (PIX) */}
      <AnimatePresence>
        {showCheckout && pixData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCheckout(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-2xl font-bold mb-6 text-center">Pagamento via PIX</h3>
              <div className="space-y-6">
                <div className="bg-white p-4 rounded-2xl flex items-center justify-center">
                  <img src={pixData.qrCode} alt="PIX QR Code" className="w-48 h-48" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Copia e Cola</label>
                  <div className="flex gap-2">
                    <input readOnly value={pixData.pixCode} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none" />
                    <button onClick={() => { navigator.clipboard.writeText(pixData.pixCode); alert("Copiado!"); }} className="px-4 bg-orange-600 rounded-xl font-bold text-xs">Copiar</button>
                  </div>
                </div>
                <div className="pt-4">
                  <button onClick={handleConfirmPayment} disabled={isConfirmingPayment} className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                    {isConfirmingPayment ? "Verificando..." : "Já realizei o pagamento"}
                  </button>
                </div>
                <p className="text-[10px] text-center text-white/20 uppercase tracking-widest">A liberação é automática após a confirmação.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Activity Summary Modal */}
      <AnimatePresence>
        {showSummaryModal && summaryActivity && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSummaryModal(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-4xl bg-[#111] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col lg:flex-row h-[80vh]">
              <div className="flex-1 relative">
                <MapComponent path={summaryActivity.path} className="h-full rounded-none border-0" />
                <div className="absolute top-6 left-6 z-[1000] px-4 py-2 bg-black/50 backdrop-blur-xl rounded-full border border-white/10">
                  <span className="text-xs font-bold text-white uppercase tracking-widest">Resumo do Treino</span>
                </div>
              </div>
              <div className="w-full lg:w-80 bg-white/5 p-8 overflow-y-auto border-l border-white/10 flex flex-col">
                <h3 className="text-2xl font-bold mb-8">Parabéns!</h3>
                
                <div className="space-y-6 mb-8">
                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Modalidade</p>
                    <p className="text-xl font-bold text-orange-500">{summaryActivity.activityType}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Distância</p>
                    <p className="text-3xl font-bold">{summaryActivity.distance}km</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Tempo</p>
                      <p className="text-xl font-bold">{formatDuration(summaryActivity.duration)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Pace</p>
                      <p className="text-xl font-bold">{summaryActivity.pace}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Notas</label>
                    <textarea 
                      value={summaryActivity.notes} 
                      onChange={e => setSummaryActivity({...summaryActivity, notes: e.target.value})}
                      placeholder="Como foi o treino?"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none h-24"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Postar na Comunidade</label>
                    <select 
                      value={summaryActivity.communityId || ""} 
                      onChange={e => setSummaryActivity({...summaryActivity, communityId: e.target.value || undefined})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors appearance-none"
                    >
                      <option value="">Nenhuma (Feed Geral)</option>
                      {communities.filter(c => c.members.includes(user?.email || "")).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-auto pt-8 flex flex-col gap-4">
                  <button onClick={handlePublishActivity} className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2">
                    <Send size={20} /> Publicar Treino
                  </button>
                  <button onClick={() => { setShowSummaryModal(false); setSummaryActivity(null); setCurrentRun({ distance: 0, duration: 0, path: [], startTime: null }); }} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 font-bold rounded-2xl transition-all">
                    Descartar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="border-t border-white/10 py-12 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <Zap className="text-orange-600" size={20} />
            <span className="font-bold tracking-tighter">STRIDEFLOW</span>
          </div>
          <p className="text-white/40 text-sm">© 2026 StrideFlow. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
