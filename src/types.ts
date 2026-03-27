export interface Workout {
  id: string;
  date: string;
  type: 'Easy' | 'Interval' | 'Long' | 'Tempo' | 'Recovery';
  distance: number; // km
  duration: number; // minutes
  intensity: number; // 1-10
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  name: string;
  goal: string;
  workouts: Workout[];
}

export type ActivityType = 'Corrida' | 'Caminhada' | 'Ciclismo' | 'Natação' | 'Trilha';

export interface RunActivity {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  date: string;
  distance: number; // km
  duration: number; // seconds
  pace: string; // min/km
  path: { lat: number; lng: number }[];
  notes?: string;
  likes: string[]; // user emails
  communityId?: string;
  activityType: ActivityType;
  comments: {
    id: string;
    userEmail: string;
    userName: string;
    text: string;
    date: string;
  }[];
}

export interface UserProfile {
  email: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  totalDistance: number;
  totalRuns: number;
  followers: string[];
  following: string[];
  completedWorkouts: string[]; // workout IDs
}

export interface UserStats {
  totalDistance: number;
  totalTime: number;
  averagePace: string;
  weeklyProgress: { day: string; distance: number }[];
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  creatorEmail: string;
  attendees: string[];
}

export interface Community {
  id: string;
  name: string;
  description: string;
  creatorEmail: string;
  members: string[];
  events: CommunityEvent[];
  date: string;
}
