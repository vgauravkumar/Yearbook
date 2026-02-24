import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  getApiErrorMessage,
  getApiErrorNumericField,
} from '../utils/errors';
import {
  formatBatchLabel,
  formatFreezeDate,
  isBatchFrozen,
  type BatchInfo,
} from '../utils/yearbook';

type SuperlativeVoteSummary = {
  id: string;
  name: string;
  vote_count: number;
};

type StudentTile = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  bio?: string;
  like_count: number;
  superlike_count: number;
  superlatives: SuperlativeVoteSummary[];
};

type SuperlativeDefinition = {
  id: string;
  name: string;
  max_votes: number;
};

type SuperlativeStatus = {
  id: string;
  name: string;
  max_votes: number;
  votes_used: number;
  remaining_votes: number;
};

type SuperlativeLeaderboard = {
  id: string;
  name: string;
  leaders: {
    user_id: string;
    full_name: string;
    profile_picture_url?: string;
    vote_count: number;
  }[];
};

type MeResponse = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  batch: (BatchInfo & { id: string }) | null;
};

type MemoryUser = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
};

type MemoryItem = {
  id: string;
  caption: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url?: string;
  duration_sec?: number | null;
  created_at: string;
  like_count: number;
  has_liked: boolean;
  user: MemoryUser;
};

type StoryGroup = {
  user: MemoryUser;
  latest_at: string;
  story_count: number;
  preview_memory: MemoryItem;
  items: MemoryItem[];
};

type Notice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

type PresignUploadResponse = {
  upload_url: string;
  object_key: string;
  required_headers?: Record<string, string>;
};

type ReactionState = {
  liked: boolean;
  superliked: boolean;
};

type HubTab = 'discover' | 'pulse' | 'bookmarks' | 'memories';
type SortMode = 'trending' | 'support' | 'alphabetical';
type InviteModalState = {
  batchId: string;
  inviteCode: string;
};

const PIN_STORAGE_KEY = 'yearbook:pinned-profiles';
const REACTION_STORAGE_KEY = 'yearbook:quick-reactions';
const NOTE_STORAGE_KEY = 'yearbook:pinned-notes';
const PENDING_INVITE_MODAL_KEY = 'yearbook:pending_invite_modal';
const DISMISSED_INVITE_MODAL_PREFIX = 'yearbook:invite-modal-dismissed:';

function readStoredStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }

  return [];
}

function readStoredReactions(key: string): Record<string, ReactionState> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const safe: Record<string, ReactionState> = {};
    for (const [studentId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;

      const liked =
        'liked' in value && typeof value.liked === 'boolean' ? value.liked : false;
      const superliked =
        'superliked' in value && typeof value.superliked === 'boolean'
          ? value.superliked
          : false;

      safe[studentId] = {
        liked: liked && !superliked,
        superliked,
      };
    }

    return safe;
  } catch {
    return {};
  }
}

function readStoredNotes(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const safe: Record<string, string> = {};
    for (const [studentId, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        safe[studentId] = value;
      }
    }

    return safe;
  } catch {
    return {};
  }
}

function getTrendingScore(student: StudentTile): number {
  const voteScore = student.superlatives.reduce(
    (total, entry) => total + entry.vote_count,
    0,
  );

  return student.like_count + student.superlike_count * 2 + voteScore * 1.5;
}

function formatRelativeTime(value: string): string {
  const now = Date.now();
  const timestamp = new Date(value).getTime();
  const diffMs = now - timestamp;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

export function DirectoryPage() {
  const navigate = useNavigate();

  const [viewerId, setViewerId] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [viewerProfilePictureUrl, setViewerProfilePictureUrl] = useState('');
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [students, setStudents] = useState<StudentTile[]>([]);
  const [superlatives, setSuperlatives] = useState<SuperlativeDefinition[]>([]);
  const [superlativeStatuses, setSuperlativeStatuses] = useState<SuperlativeStatus[]>([]);
  const [superlativeLeaderboards, setSuperlativeLeaderboards] = useState<
    SuperlativeLeaderboard[]
  >([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [reels, setReels] = useState<MemoryItem[]>([]);
  const [canPostMemories, setCanPostMemories] = useState(true);
  const [memoryFeedLoading, setMemoryFeedLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('trending');
  const [activeTab, setActiveTab] = useState<HubTab>('discover');
  const [flippedStudentId, setFlippedStudentId] = useState<string | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [votingKey, setVotingKey] = useState<string | null>(null);
  const [reactionLoadingKey, setReactionLoadingKey] = useState<string | null>(null);
  const [remainingVotesBySuperlative, setRemainingVotesBySuperlative] = useState<
    Record<string, number>
  >({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [memoryCaption, setMemoryCaption] = useState('');
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  const [memoryUploading, setMemoryUploading] = useState(false);
  const [memoryReactingId, setMemoryReactingId] = useState<string | null>(null);
  const [memoryDeletingId, setMemoryDeletingId] = useState<string | null>(null);
  const [storyViewer, setStoryViewer] = useState<{
    storyIndex: number;
    itemIndex: number;
  } | null>(null);
  const [inviteModal, setInviteModal] = useState<InviteModalState | null>(null);
  const [copyingInvite, setCopyingInvite] = useState(false);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    readStoredStringArray(PIN_STORAGE_KEY),
  );
  const [reactionsByStudent, setReactionsByStudent] = useState<
    Record<string, ReactionState>
  >(() => readStoredReactions(REACTION_STORAGE_KEY));
  const [pinNotes, setPinNotes] = useState<Record<string, string>>(() =>
    readStoredNotes(NOTE_STORAGE_KEY),
  );

  useEffect(() => {
    async function loadHub() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        navigate('/auth', { replace: true });
        return;
      }

      try {
        const meResponse = await api.get('/api/v1/users/me');
        const me: MeResponse = meResponse.data;

        if (!me.batch) {
          navigate('/onboard', { replace: true });
          return;
        }

        setViewerId(me.id);
        setViewerName(me.full_name);
        setViewerProfilePictureUrl(me.profile_picture_url ?? '');
        setBatch(me.batch);

        try {
          const pendingRaw = localStorage.getItem(PENDING_INVITE_MODAL_KEY);
          const dismissedKey = `${DISMISSED_INVITE_MODAL_PREFIX}${me.batch.id}`;
          if (pendingRaw && !localStorage.getItem(dismissedKey)) {
            const pending = JSON.parse(pendingRaw) as Partial<InviteModalState>;
            if (
              pending.batchId === me.batch.id &&
              typeof pending.inviteCode === 'string' &&
              pending.inviteCode.length > 0
            ) {
              setInviteModal({
                batchId: pending.batchId,
                inviteCode: pending.inviteCode,
              });
            }
          }
        } catch {
          // Ignore malformed local storage payloads.
        }

        const [studentResponse, superlativeResponse] = await Promise.all([
          api.get(`/api/v1/batches/${me.batch.id}/members`, {
            params: { page: 1, limit: 300 },
          }),
          api.get('/api/v1/superlatives'),
        ]);

        const loadedStudents: StudentTile[] =
          studentResponse.data.members ?? studentResponse.data.students ?? [];
        setStudents(loadedStudents);
        setSuperlatives(superlativeResponse.data.superlatives ?? []);

        if (loadedStudents.length > 0) {
          setSpotlightId(loadedStudents[0].id);
        }

        try {
          const statusResponse = await api.get('/api/v1/superlatives/me/status');
          const statuses: SuperlativeStatus[] = statusResponse.data.statuses ?? [];
          const leaderboards: SuperlativeLeaderboard[] =
            statusResponse.data.leaderboards ?? [];

          setSuperlativeStatuses(statuses);
          setSuperlativeLeaderboards(leaderboards);
          setRemainingVotesBySuperlative(
            Object.fromEntries(statuses.map((status) => [status.id, status.remaining_votes])),
          );
        } catch {
          setSuperlativeStatuses([]);
          setSuperlativeLeaderboards([]);
        }

        try {
          const memoryResponse = await api.get('/api/v1/memories/feed');
          setStories(memoryResponse.data.stories ?? []);
          setReels(memoryResponse.data.reels ?? []);
          setCanPostMemories(Boolean(memoryResponse.data.can_post));
        } catch {
          setStories([]);
          setReels([]);
        } finally {
          setMemoryFeedLoading(false);
        }
      } catch (errorValue: unknown) {
        const message = getApiErrorMessage(errorValue, 'Failed to load campus hub');
        if (message.toLowerCase().includes('unauthorized')) {
          localStorage.removeItem('access_token');
          navigate('/auth', { replace: true });
          return;
        }

        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadHub();
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  useEffect(() => {
    localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(reactionsByStudent));
  }, [reactionsByStudent]);

  useEffect(() => {
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(pinNotes));
  }, [pinNotes]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const frozen = useMemo(() => isBatchFrozen(batch), [batch]);
  const batchLabel = useMemo(() => formatBatchLabel(batch), [batch]);
  const freezeDateLabel = useMemo(() => formatFreezeDate(batch), [batch]);
  const inviteLink = useMemo(
    () => (inviteModal ? `https://meracto.com/join/${inviteModal.inviteCode}` : ''),
    [inviteModal],
  );

  const sortedStudents = useMemo(() => {
    const list = [...students];

    if (sortMode === 'alphabetical') {
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      return list;
    }

    if (sortMode === 'support') {
      list.sort((a, b) => {
        if (b.superlike_count !== a.superlike_count) {
          return b.superlike_count - a.superlike_count;
        }
        return b.like_count - a.like_count;
      });
      return list;
    }

    list.sort((a, b) => getTrendingScore(b) - getTrendingScore(a));
    return list;
  }, [students, sortMode]);

  const spotlightStudent = useMemo(
    () => sortedStudents.find((student) => student.id === spotlightId) ?? null,
    [sortedStudents, spotlightId],
  );

  const pinnedStudents = useMemo(() => {
    const byId = new Map(students.map((student) => [student.id, student]));
    return pinnedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is StudentTile => Boolean(entry));
  }, [pinnedIds, students]);

  const topLiked = useMemo(
    () => [...students].sort((a, b) => b.like_count - a.like_count).slice(0, 5),
    [students],
  );

  const topSuperliked = useMemo(
    () => [...students].sort((a, b) => b.superlike_count - a.superlike_count).slice(0, 5),
    [students],
  );

  const totalLikes = useMemo(
    () => students.reduce((total, student) => total + student.like_count, 0),
    [students],
  );

  const totalSuperlikes = useMemo(
    () => students.reduce((total, student) => total + student.superlike_count, 0),
    [students],
  );

  const totalSuperlativeVotes = useMemo(
    () =>
      students.reduce(
        (total, student) =>
          total +
          student.superlatives.reduce((innerTotal, entry) => innerTotal + entry.vote_count, 0),
        0,
      ),
    [students],
  );

  const fallbackSuperlativeLeaders = useMemo(
    () =>
      superlatives
        .map((superlative) => {
          const leaders = students
            .map((student) => {
              const votes =
                student.superlatives.find((entry) => entry.id === superlative.id)
                  ?.vote_count ?? 0;

              return {
                user_id: student.id,
                full_name: student.full_name,
                vote_count: votes,
              };
            })
            .filter((entry) => entry.vote_count > 0)
            .sort((a, b) => b.vote_count - a.vote_count)
            .slice(0, 5);

          return {
            id: superlative.id,
            name: superlative.name,
            leaders,
          };
        })
        .filter((entry) => entry.leaders.length > 0),
    [students, superlatives],
  );

  const displayedLeaderboards =
    superlativeLeaderboards.length > 0 ? superlativeLeaderboards : fallbackSuperlativeLeaders;

  const topSuperlativeHighlights = useMemo(
    () =>
      [...displayedLeaderboards]
        .filter((entry) => entry.leaders.length > 0)
        .sort((a, b) => {
          const topVotesA = a.leaders[0]?.vote_count ?? 0;
          const topVotesB = b.leaders[0]?.vote_count ?? 0;
          return topVotesB - topVotesA;
        })
        .slice(0, 3),
    [displayedLeaderboards],
  );

  const totalRemainingVotes = useMemo(
    () => superlativeStatuses.reduce((sum, status) => sum + status.remaining_votes, 0),
    [superlativeStatuses],
  );

  const currentStory = useMemo(() => {
    if (!storyViewer) return null;

    const story = stories[storyViewer.storyIndex];
    if (!story) return null;

    const item = story.items[storyViewer.itemIndex];
    if (!item) return null;

    return {
      story,
      item,
      storyIndex: storyViewer.storyIndex,
      itemIndex: storyViewer.itemIndex,
    };
  }, [stories, storyViewer]);

  function handleLogout() {
    localStorage.removeItem('access_token');
    navigate('/', { replace: true });
  }

  function dismissInviteModal() {
    if (!inviteModal) return;
    localStorage.setItem(
      `${DISMISSED_INVITE_MODAL_PREFIX}${inviteModal.batchId}`,
      '1',
    );
    localStorage.removeItem(PENDING_INVITE_MODAL_KEY);
    setInviteModal(null);
  }

  async function copyInviteLink() {
    if (!inviteLink) return;

    setCopyingInvite(true);
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNotice({ tone: 'success', message: 'Invite link copied.' });
    } catch {
      setNotice({ tone: 'error', message: 'Unable to copy invite link.' });
    } finally {
      setCopyingInvite(false);
    }
  }

  function togglePin(studentId: string) {
    setPinnedIds((previous) => {
      if (previous.includes(studentId)) {
        return previous.filter((id) => id !== studentId);
      }

      return [studentId, ...previous];
    });
  }

  function updateNote(studentId: string, value: string) {
    setPinNotes((previous) => ({
      ...previous,
      [studentId]: value,
    }));
  }

  function shuffleSpotlight() {
    if (sortedStudents.length === 0) return;

    const candidates = sortedStudents.filter((student) => student.id !== spotlightId);
    const source = candidates.length > 0 ? candidates : sortedStudents;
    const randomStudent = source[Math.floor(Math.random() * source.length)];

    setSpotlightId(randomStudent.id);
    setNotice({
      tone: 'success',
      message: `Spotlight switched to ${randomStudent.full_name}.`,
    });
  }

  function updateMemoryLikeState(memoryId: string, liked: boolean, likeCount: number) {
    setReels((previous) =>
      previous.map((memory) =>
        memory.id === memoryId
          ? {
              ...memory,
              has_liked: liked,
              like_count: likeCount,
            }
          : memory,
      ),
    );

    setStories((previous) =>
      previous
        .map((story) => {
          const items = story.items.map((memory) =>
            memory.id === memoryId
              ? {
                  ...memory,
                  has_liked: liked,
                  like_count: likeCount,
                }
              : memory,
          );

          if (items.length === 0) return story;

          return {
            ...story,
            items,
            preview_memory: items[items.length - 1],
          };
        })
        .filter((story) => story.items.length > 0),
    );
  }

  function removeMemoryFromState(memoryId: string) {
    setReels((previous) => previous.filter((memory) => memory.id !== memoryId));

    setStories((previous) =>
      previous
        .map((story) => {
          const items = story.items.filter((memory) => memory.id !== memoryId);
          if (items.length === 0) return null;

          return {
            ...story,
            items,
            story_count: items.length,
            latest_at: items[items.length - 1].created_at,
            preview_memory: items[items.length - 1],
          };
        })
        .filter((story): story is StoryGroup => Boolean(story)),
    );
  }

  function appendMemoryToState(memory: MemoryItem) {
    setReels((previous) => [memory, ...previous]);

    setStories((previous) => {
      const existingIndex = previous.findIndex((story) => story.user.id === memory.user.id);

      if (existingIndex === -1) {
        return [
          {
            user: memory.user,
            latest_at: memory.created_at,
            story_count: 1,
            preview_memory: memory,
            items: [memory],
          },
          ...previous,
        ].slice(0, 25);
      }

      const existing = previous[existingIndex];
      const updatedItems = [...existing.items, memory].slice(-8);
      const updatedStory: StoryGroup = {
        ...existing,
        latest_at: memory.created_at,
        story_count: updatedItems.length,
        preview_memory: updatedItems[updatedItems.length - 1],
        items: updatedItems,
      };

      return [
        updatedStory,
        ...previous.filter((_, index) => index !== existingIndex),
      ].slice(0, 25);
    });
  }

  async function handleQuickReaction(studentId: string, isSuperlike: boolean) {
    if (frozen) {
      setNotice({
        tone: 'info',
        message: `Interactions are disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    if (viewerId === studentId) {
      setNotice({
        tone: 'info',
        message: 'You cannot react to your own profile.',
      });
      return;
    }

    const reactionKey = `${studentId}:${isSuperlike ? 'superlike' : 'like'}`;
    setReactionLoadingKey(reactionKey);

    try {
      const response = await api.post(`/api/v1/users/${studentId}/like`, {
        is_superlike: isSuperlike,
      });

      const message =
        typeof response.data.message === 'string' ? response.data.message : 'Reaction updated';
      const interactions = response.data.current_user_interactions as
        | { has_liked: boolean; has_superliked: boolean }
        | undefined;

      setStudents((previous) =>
        previous.map((student) =>
          student.id === studentId
            ? {
                ...student,
                like_count: response.data.like_count,
                superlike_count: response.data.superlike_count,
              }
            : student,
        ),
      );

      setReactionsByStudent((previous) => {
        return {
          ...previous,
          [studentId]: {
            liked: interactions?.has_liked ?? false,
            superliked: interactions?.has_superliked ?? false,
          },
        };
      });

      setNotice({ tone: 'success', message });
    } catch (errorValue: unknown) {
      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to update reaction'),
      });
    } finally {
      setReactionLoadingKey(null);
    }
  }

  async function handleVote(studentId: string, superlativeId: string) {
    if (frozen) {
      setNotice({
        tone: 'info',
        message: `Voting is disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    if (viewerId === studentId) {
      setNotice({
        tone: 'info',
        message: 'You cannot vote for yourself.',
      });
      return;
    }

    const key = `${studentId}:${superlativeId}`;
    setVotingKey(key);

    try {
      const response = await api.post(`/api/v1/superlatives/${superlativeId}/vote`, {
        to_user_id: studentId,
      });

      const remainingVotes =
        typeof response.data.remaining_votes === 'number'
          ? response.data.remaining_votes
          : undefined;

      if (remainingVotes !== undefined) {
        setRemainingVotesBySuperlative((previous) => ({
          ...previous,
          [superlativeId]: remainingVotes,
        }));

        setSuperlativeStatuses((previous) =>
          previous.map((status) =>
            status.id === superlativeId
              ? {
                  ...status,
                  votes_used:
                    typeof response.data.votes_used === 'number'
                      ? response.data.votes_used
                      : status.votes_used + 1,
                  remaining_votes: remainingVotes,
                }
              : status,
          ),
        );
      }

      const superlativeName =
        superlatives.find((entry) => entry.id === superlativeId)?.name ?? 'Superlative';

      setStudents((previous) =>
        previous.map((student) => {
          if (student.id !== studentId) return student;

          const existing = student.superlatives.find((entry) => entry.id === superlativeId);
          if (existing) {
            return {
              ...student,
              superlatives: student.superlatives.map((entry) =>
                entry.id === superlativeId
                  ? { ...entry, vote_count: entry.vote_count + 1 }
                  : entry,
              ),
            };
          }

          return {
            ...student,
            superlatives: [
              ...student.superlatives,
              {
                id: superlativeId,
                name: superlativeName,
                vote_count: 1,
              },
            ],
          };
        }),
      );

      try {
        const statusResponse = await api.get('/api/v1/superlatives/me/status');
        setSuperlativeStatuses(statusResponse.data.statuses ?? []);
        setSuperlativeLeaderboards(statusResponse.data.leaderboards ?? []);
        if (Array.isArray(statusResponse.data.statuses)) {
          setRemainingVotesBySuperlative(
            Object.fromEntries(
              statusResponse.data.statuses.map((status: SuperlativeStatus) => [
                status.id,
                status.remaining_votes,
              ]),
            ),
          );
        }
      } catch {
        // ignore refresh failures
      }

      setNotice({
        tone: 'success',
        message: `Vote recorded for ${superlativeName}.`,
      });
    } catch (errorValue: unknown) {
      const maxVotes = getApiErrorNumericField(errorValue, 'max_votes');
      const usedVotes = getApiErrorNumericField(errorValue, 'votes_used');

      if (maxVotes !== null && usedVotes !== null && usedVotes >= maxVotes) {
        setRemainingVotesBySuperlative((previous) => ({
          ...previous,
          [superlativeId]: 0,
        }));
      }

      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to submit vote'),
      });
    } finally {
      setVotingKey(null);
    }
  }

  function handleMemoryFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;

    if (selectedFile.size > 25 * 1024 * 1024) {
      setNotice({
        tone: 'error',
        message: 'Memory file must be smaller than 25MB.',
      });
      return;
    }

    setMemoryFile(selectedFile);
  }

  async function handleMemorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!memoryFile) {
      setNotice({ tone: 'info', message: 'Attach an image or video first.' });
      return;
    }

    if (!canPostMemories || frozen) {
      setNotice({
        tone: 'info',
        message: `Posting memories is disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    setMemoryUploading(true);

    try {
      const presignResponse = await api.post<PresignUploadResponse>(
        '/api/v1/uploads/presign',
        {
          kind: 'memory',
          mime_type: memoryFile.type,
          size_bytes: memoryFile.size,
        },
      );

      const uploadHeaders = new Headers(presignResponse.data.required_headers ?? {});
      if (!uploadHeaders.has('Content-Type')) {
        uploadHeaders.set('Content-Type', memoryFile.type || 'application/octet-stream');
      }

      const uploadResponse = await fetch(presignResponse.data.upload_url, {
        method: 'PUT',
        headers: uploadHeaders,
        body: memoryFile,
      });
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload memory to storage.');
      }

      const response = await api.post('/api/v1/memories', {
        object_key: presignResponse.data.object_key,
        caption: memoryCaption,
      });

      const createdMemory: MemoryItem = response.data;
      appendMemoryToState(createdMemory);
      setMemoryCaption('');
      setMemoryFile(null);

      setNotice({ tone: 'success', message: 'Memory posted to your class stream.' });
    } catch (errorValue: unknown) {
      const apiMessage = getApiErrorMessage(errorValue, '');
      setNotice({
        tone: 'error',
        message:
          apiMessage ||
          (errorValue instanceof Error ? errorValue.message : 'Unable to post memory'),
      });
    } finally {
      setMemoryUploading(false);
    }
  }

  async function toggleMemoryLike(memory: MemoryItem) {
    if (memory.user.id === viewerId) {
      setNotice({ tone: 'info', message: 'You cannot react to your own memory.' });
      return;
    }

    if (frozen) {
      setNotice({
        tone: 'info',
        message: `Memory interactions are disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    setMemoryReactingId(memory.id);

    try {
      const response = await api.post(`/api/v1/memories/${memory.id}/react`);
      const liked = Boolean(response.data.liked);
      const likeCount = Number(response.data.like_count ?? 0);
      updateMemoryLikeState(memory.id, liked, likeCount);
    } catch (errorValue: unknown) {
      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to update memory reaction'),
      });
    } finally {
      setMemoryReactingId(null);
    }
  }

  async function deleteMemory(memoryId: string) {
    setMemoryDeletingId(memoryId);

    try {
      await api.delete(`/api/v1/memories/${memoryId}`);
      removeMemoryFromState(memoryId);
      setNotice({ tone: 'success', message: 'Memory deleted.' });
    } catch (errorValue: unknown) {
      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to delete memory'),
      });
    } finally {
      setMemoryDeletingId(null);
    }
  }

  function openStory(index: number) {
    setStoryViewer({ storyIndex: index, itemIndex: 0 });
  }

  function closeStoryViewer() {
    setStoryViewer(null);
  }

  function goToNextStoryItem() {
    if (!currentStory) return;

    const currentItems = currentStory.story.items;
    if (currentStory.itemIndex < currentItems.length - 1) {
      setStoryViewer((previous) =>
        previous
          ? {
              storyIndex: previous.storyIndex,
              itemIndex: previous.itemIndex + 1,
            }
          : previous,
      );
      return;
    }

    if (currentStory.storyIndex < stories.length - 1) {
      setStoryViewer({
        storyIndex: currentStory.storyIndex + 1,
        itemIndex: 0,
      });
      return;
    }

    setStoryViewer(null);
  }

  function goToPreviousStoryItem() {
    if (!currentStory) return;

    if (currentStory.itemIndex > 0) {
      setStoryViewer((previous) =>
        previous
          ? {
              storyIndex: previous.storyIndex,
              itemIndex: previous.itemIndex - 1,
            }
          : previous,
      );
      return;
    }

    if (currentStory.storyIndex > 0) {
      const previousStory = stories[currentStory.storyIndex - 1];
      setStoryViewer({
        storyIndex: currentStory.storyIndex - 1,
        itemIndex: Math.max(previousStory.items.length - 1, 0),
      });
      return;
    }

    setStoryViewer(null);
  }

  if (loading) {
    return (
      <div className="page-shell hub-page">
        <div className="loading-screen">Loading campus hub...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell hub-page">
        <section className="panel unauth-shell">
          <h1>Hub unavailable</h1>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            Back to landing
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell hub-page">
      <header className="top-nav hub-header">
        <div className="brand-wrap">
          <span className="brand-mark">YB</span>
          <div>
            <p className="eyebrow">Campus Hub</p>
            <h1>{batchLabel}</h1>
          </div>
        </div>

        <div className="nav-actions">
          <button
            type="button"
            className="user-chip user-chip-button"
            onClick={() => navigate('/profile/edit')}
            aria-label="Edit profile"
          >
            <span className="user-chip-avatar" aria-hidden="true">
              {viewerProfilePictureUrl ? (
                <img src={viewerProfilePictureUrl} alt="" />
              ) : (
                viewerName.trim().charAt(0).toUpperCase()
              )}
            </span>
            <span>{viewerName}</span>
          </button>
          <button
            type="button"
            className="btn btn-danger btn-icon"
            onClick={handleLogout}
            aria-label="Logout"
          >
            <span aria-hidden="true">⎋</span>
            <span className="sr-only">Logout</span>
          </button>
        </div>
      </header>

      <main className="hub-shell">
        <section className="panel hub-toolbar">
          <div className="hub-toolbar-top">
            <div className="hub-tab-row" role="tablist" aria-label="Hub sections">
              <button
                type="button"
                className={`hub-tab ${activeTab === 'discover' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('discover')}
              >
                Discover
              </button>
              <button
                type="button"
                className={`hub-tab ${activeTab === 'pulse' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('pulse')}
              >
                Pulse
              </button>
              <button
                type="button"
                className={`hub-tab ${activeTab === 'memories' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('memories')}
              >
                Memories
              </button>
              <button
                type="button"
                className={`hub-tab ${activeTab === 'bookmarks' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('bookmarks')}
              >
                Bookmarks
              </button>
            </div>

            <div className="toolbar-meta">
              <span className="pill">{students.length} students</span>
              <span className="pill">{pinnedStudents.length} pinned</span>
              <span className="pill">{totalRemainingVotes} votes left</span>
              <span className={`pill ${frozen ? 'frozen' : 'active'}`}>
                {frozen ? `Frozen on ${freezeDateLabel}` : 'Batch open'}
              </span>
            </div>
          </div>

          <div className="hub-toolbar-grid">
            <label className="field">
              <span>Sort by</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
              >
                <option value="trending">Trending now</option>
                <option value="support">Most support</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
            </label>

            <div className="hub-toolbar-actions">
              <button type="button" className="btn btn-primary" onClick={shuffleSpotlight}>
                Surprise me
              </button>
            </div>
          </div>

        </section>

        {notice && <p className={`inline-notice ${notice.tone}`}>{notice.message}</p>}

        {activeTab === 'discover' && (
          <section className="hub-content">
            {spotlightStudent && (
              <article className="panel spotlight-panel">
                <div className="spotlight-head">
                  <p className="eyebrow">Current spotlight</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={shuffleSpotlight}
                  >
                    Change
                  </button>
                </div>

                <div className="spotlight-body">
                  <div className="avatar avatar-large">
                    {spotlightStudent.profile_picture_url ? (
                      <img
                        src={spotlightStudent.profile_picture_url}
                        alt={spotlightStudent.full_name}
                      />
                    ) : (
                      <span>{spotlightStudent.full_name.slice(0, 1)}</span>
                    )}
                  </div>

                  <div>
                    <h2>{spotlightStudent.full_name}</h2>
                    <p>{spotlightStudent.bio || 'No bio yet.'}</p>
                    <div className="tile-counts">
                      <span>{spotlightStudent.like_count} likes</span>
                      <span>{spotlightStudent.superlike_count} superlikes</span>
                    </div>
                  </div>
                </div>
              </article>
            )}

            <article className="panel vote-budget-panel">
              <h3>Top voted in superlatives</h3>
              {topSuperlativeHighlights.length > 0 ? (
                <div className="vote-budget-grid">
                  {topSuperlativeHighlights.map((entry) => (
                    <div key={`highlight-${entry.id}`} className="vote-budget-card">
                      <p>{entry.name}</p>
                      <strong>{entry.leaders[0].full_name}</strong>
                      <span>
                        {entry.leaders[0].vote_count} votes
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Top winners will appear once votes are recorded.</p>
              )}
            </article>

            <div className="directory-grid discover-grid">
              {sortedStudents.map((student) => {
                const isFlipped = flippedStudentId === student.id;
                const isPinned = pinnedIds.includes(student.id);
                const voteMap = new Map(
                  student.superlatives.map((entry) => [entry.id, entry.vote_count]),
                );

                const reactions =
                  reactionsByStudent[student.id] ?? ({ liked: false, superliked: false } as const);
                const likeLoading = reactionLoadingKey === `${student.id}:like`;
                const superlikeLoading = reactionLoadingKey === `${student.id}:superlike`;

                return (
                  <article key={student.id} className={`year-card ${isFlipped ? 'is-flipped' : ''}`}>
                    <div className="year-card-inner">
                      <section className="year-card-face year-card-front">
                        <div className="card-top-actions">
                          <button
                            type="button"
                            className={`pin-toggle ${isPinned ? 'is-pinned' : ''}`}
                            onClick={() => togglePin(student.id)}
                            aria-label={isPinned ? 'Unpin profile' : 'Pin profile'}
                          >
                            <span aria-hidden="true">{isPinned ? '📌' : '📍'}</span>
                            <span className="sr-only">{isPinned ? 'Pinned' : 'Pin'}</span>
                          </button>

                          <button
                            type="button"
                            className="flip-trigger"
                            onClick={() => setFlippedStudentId(student.id)}
                            aria-label={`Show superlatives for ${student.full_name}`}
                          >
                            i
                          </button>
                        </div>

                        <button
                          type="button"
                          className="year-card-open"
                          onClick={() => navigate(`/profile/${student.id}`)}
                        >
                          <div className="avatar">
                            {student.profile_picture_url ? (
                              <img src={student.profile_picture_url} alt={student.full_name} />
                            ) : (
                              <span>{student.full_name.slice(0, 1)}</span>
                            )}
                          </div>
                          <h2>{student.full_name}</h2>
                          <p>{student.bio || 'No bio yet.'}</p>
                        </button>

                        <div className="tile-counts">
                          <span>{student.like_count} likes</span>
                          <span>{student.superlike_count} superlikes</span>
                        </div>

                        <div className="student-quick-actions">
                          <button
                            type="button"
                            className={`chip-action ${reactions.liked ? 'is-active' : ''}`}
                            onClick={() => handleQuickReaction(student.id, false)}
                            disabled={frozen || likeLoading || viewerId === student.id}
                          >
                            {likeLoading ? '...' : reactions.liked ? 'Liked' : 'Like'}
                          </button>
                          <button
                            type="button"
                            className={`chip-action ${reactions.superliked ? 'is-active' : ''}`}
                            onClick={() => handleQuickReaction(student.id, true)}
                            disabled={frozen || superlikeLoading || viewerId === student.id}
                          >
                            {superlikeLoading
                              ? '...'
                              : reactions.superliked
                                ? 'Superliked'
                                : 'Superlike'}
                          </button>
                        </div>
                      </section>

                      <section className="year-card-face year-card-back">
                        <div className="year-card-back-head">
                          <h3>Superlatives</h3>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setFlippedStudentId(null)}
                          >
                            Close
                          </button>
                        </div>

                        {superlatives.length > 0 ? (
                          <ul className="vote-list">
                            {superlatives.map((superlative) => {
                              const voteCount = voteMap.get(superlative.id) ?? 0;
                              const remainingVotes = remainingVotesBySuperlative[superlative.id];
                              const outOfVotes = remainingVotes === 0;
                              const isVoting =
                                votingKey === `${student.id}:${superlative.id}`;

                              let voteLabel = 'Vote';
                              if (isVoting) voteLabel = 'Voting...';
                              else if (outOfVotes) voteLabel = 'No votes left';
                              else if (remainingVotes !== undefined) {
                                voteLabel = `Vote (${remainingVotes} left)`;
                              }

                              return (
                                <li
                                  key={`${student.id}-${superlative.id}`}
                                  className="vote-row"
                                >
                                  <div>
                                    <p className="vote-title">{superlative.name}</p>
                                    <p className="vote-meta">{voteCount} votes</p>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleVote(student.id, superlative.id)}
                                    disabled={
                                      frozen ||
                                      outOfVotes ||
                                      isVoting ||
                                      viewerId === student.id
                                    }
                                  >
                                    {voteLabel}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="muted">No active superlatives.</p>
                        )}

                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          onClick={() => navigate(`/profile/${student.id}`)}
                        >
                          Open profile
                        </button>
                      </section>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'pulse' && (
          <section className="hub-content pulse-grid">
            <article className="panel pulse-card">
              <h3>Most liked</h3>
              <ol className="rank-list">
                {topLiked.map((student) => (
                  <li key={`liked-${student.id}`}>
                    <button
                      type="button"
                      className="rank-entry"
                      onClick={() => navigate(`/profile/${student.id}`)}
                    >
                      <span>{student.full_name}</span>
                      <strong>{student.like_count}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            </article>

            <article className="panel pulse-card">
              <h3>Most superliked</h3>
              <ol className="rank-list">
                {topSuperliked.map((student) => (
                  <li key={`super-${student.id}`}>
                    <button
                      type="button"
                      className="rank-entry"
                      onClick={() => navigate(`/profile/${student.id}`)}
                    >
                      <span>{student.full_name}</span>
                      <strong>{student.superlike_count}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            </article>

            <article className="panel pulse-card pulse-summary">
              <h3>Class energy</h3>
              <div className="stat-grid">
                <div className="stat-item">
                  <p>Total likes</p>
                  <strong>{totalLikes}</strong>
                </div>
                <div className="stat-item">
                  <p>Total superlikes</p>
                  <strong>{totalSuperlikes}</strong>
                </div>
                <div className="stat-item">
                  <p>Superlative votes</p>
                  <strong>{totalSuperlativeVotes}</strong>
                </div>
              </div>
            </article>

            <article className="panel pulse-card superlative-board">
              <h3>Superlative board</h3>
              {displayedLeaderboards.length > 0 ? (
                <div className="superlative-board-list">
                  {displayedLeaderboards.map((entry) => (
                    <section key={entry.id} className="superlative-board-card">
                      <h4>{entry.name}</h4>
                      <ol className="rank-list">
                        {entry.leaders.slice(0, 3).map((leader) => (
                          <li key={`${entry.id}-${leader.user_id}`}>
                            <button
                              type="button"
                              className="rank-entry"
                              onClick={() => navigate(`/profile/${leader.user_id}`)}
                            >
                              <span>{leader.full_name}</span>
                              <strong>{leader.vote_count}</strong>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="muted">No superlative votes yet.</p>
              )}
            </article>
          </section>
        )}

        {activeTab === 'memories' && (
          <section className="hub-content memory-tab">
            <article className="panel memory-composer">
              <div>
                <p className="eyebrow">Stories + Reels</p>
                <h3>Share a memory</h3>
              </div>

              <form onSubmit={handleMemorySubmit} className="memory-form">
                <label className="field">
                  <span>Caption</span>
                  <textarea
                    value={memoryCaption}
                    onChange={(event) => setMemoryCaption(event.target.value)}
                    rows={3}
                    maxLength={280}
                    placeholder="Drop a moment from campus life"
                    disabled={!canPostMemories || frozen}
                  />
                </label>

                <div className="memory-form-row">
                  <label className="field memory-file-input">
                    <span>Image or video</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleMemoryFileChange}
                      disabled={!canPostMemories || frozen}
                    />
                  </label>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={memoryUploading || !memoryFile || !canPostMemories || frozen}
                  >
                    {memoryUploading ? 'Posting...' : 'Post memory'}
                  </button>
                </div>

                {memoryFile && (
                  <p className="muted">
                    Selected: {memoryFile.name} ({Math.round(memoryFile.size / 1024)} KB)
                  </p>
                )}
              </form>
            </article>

            <article className="panel story-strip-panel">
              <div className="section-head">
                <h3>Stories</h3>
                <span className="muted">Auto-expiring in 24h</span>
              </div>

              {memoryFeedLoading ? (
                <p className="muted">Loading stories...</p>
              ) : stories.length > 0 ? (
                <div className="story-strip">
                  {stories.map((story, index) => (
                    <button
                      key={`story-${story.user.id}`}
                      type="button"
                      className="story-bubble"
                      onClick={() => openStory(index)}
                    >
                      <div className="story-avatar-ring">
                        <div className="avatar story-avatar">
                          {story.user.profile_picture_url ? (
                            <img src={story.user.profile_picture_url} alt={story.user.full_name} />
                          ) : (
                            <span>{story.user.full_name.slice(0, 1)}</span>
                          )}
                        </div>
                      </div>
                      <span>{story.user.full_name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No active stories yet. Be the first to post.</p>
              )}
            </article>

            <article className="panel reels-panel">
              <div className="section-head">
                <h3>Reels stream</h3>
                <span className="muted">{reels.length} memories</span>
              </div>

              {memoryFeedLoading ? (
                <p className="muted">Loading reels...</p>
              ) : reels.length > 0 ? (
                <div className="reels-grid">
                  {reels.map((memory) => (
                    <article key={`reel-${memory.id}`} className="reel-card">
                      <div className="reel-head">
                        <button
                          type="button"
                          className="reel-user"
                          onClick={() => navigate(`/profile/${memory.user.id}`)}
                        >
                          <div className="avatar reel-avatar">
                            {memory.user.profile_picture_url ? (
                              <img
                                src={memory.user.profile_picture_url}
                                alt={memory.user.full_name}
                              />
                            ) : (
                              <span>{memory.user.full_name.slice(0, 1)}</span>
                            )}
                          </div>
                          <div>
                            <strong>{memory.user.full_name}</strong>
                            <span>{formatRelativeTime(memory.created_at)}</span>
                          </div>
                        </button>

                        {memory.user.id === viewerId && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => deleteMemory(memory.id)}
                            disabled={memoryDeletingId === memory.id}
                          >
                            {memoryDeletingId === memory.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>

                      <div className="reel-media">
                        {memory.media_type === 'video' ? (
                          <video
                            src={memory.media_url}
                            controls
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img src={memory.media_url} alt={memory.caption || 'Memory'} />
                        )}
                      </div>

                      <div className="reel-body">
                        {memory.caption && <p>{memory.caption}</p>}
                        <div className="reel-actions">
                          <button
                            type="button"
                            className={`chip-action ${memory.has_liked ? 'is-active' : ''}`}
                            onClick={() => toggleMemoryLike(memory)}
                            disabled={memoryReactingId === memory.id || viewerId === memory.user.id}
                          >
                            {memoryReactingId === memory.id
                              ? '...'
                              : memory.has_liked
                                ? 'Liked'
                                : 'Like'}
                          </button>
                          <span className="pill">{memory.like_count} likes</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">No memories yet. Start the stream with your first post.</p>
              )}
            </article>
          </section>
        )}

        {activeTab === 'bookmarks' && (
          <section className="hub-content">
            {pinnedStudents.length === 0 ? (
              <article className="panel empty-bookmarks">
                <h3>No pinned classmates yet</h3>
                <p>Pin profiles in Discover to build your own memory shortlist.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveTab('discover')}
                >
                  Open Discover
                </button>
              </article>
            ) : (
              <div className="bookmark-grid">
                {pinnedStudents.map((student) => (
                  <article key={`pin-${student.id}`} className="panel bookmark-card">
                    <div className="bookmark-head">
                      <div className="avatar">
                        {student.profile_picture_url ? (
                          <img src={student.profile_picture_url} alt={student.full_name} />
                        ) : (
                          <span>{student.full_name.slice(0, 1)}</span>
                        )}
                      </div>

                      <div>
                        <h3>{student.full_name}</h3>
                        <p>{student.bio || 'No bio yet.'}</p>
                      </div>
                    </div>

                    <label className="field">
                      <span>Private note</span>
                      <textarea
                        value={pinNotes[student.id] ?? ''}
                        onChange={(event) => updateNote(student.id, event.target.value)}
                        rows={3}
                        placeholder="Why did you pin this profile?"
                      />
                    </label>

                    <div className="bookmark-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/profile/${student.id}`)}
                      >
                        Open profile
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => togglePin(student.id)}
                      >
                        Remove pin
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {inviteModal && (
        <div className="invite-modal-overlay" role="presentation" onClick={dismissInviteModal}>
          <article
            className="panel invite-modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Batch invite</p>
            <h2>You just created your batch&apos;s yearbook.</h2>
            <p>Share this link with your batchmates so they join the same group:</p>
            <code className="invite-link">{inviteLink}</code>
            <div className="invite-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={copyInviteLink}
                disabled={copyingInvite}
              >
                {copyingInvite ? 'Copying...' : 'Copy link'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={dismissInviteModal}>
                Dismiss
              </button>
            </div>
          </article>
        </div>
      )}

      {currentStory && (
        <div className="story-viewer-overlay" role="presentation" onClick={closeStoryViewer}>
          <article
            className="story-viewer-card"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="story-viewer-head">
              <button
                type="button"
                className="reel-user"
                onClick={() => navigate(`/profile/${currentStory.item.user.id}`)}
              >
                <div className="avatar reel-avatar">
                  {currentStory.item.user.profile_picture_url ? (
                    <img
                      src={currentStory.item.user.profile_picture_url}
                      alt={currentStory.item.user.full_name}
                    />
                  ) : (
                    <span>{currentStory.item.user.full_name.slice(0, 1)}</span>
                  )}
                </div>
                <div>
                  <strong>{currentStory.item.user.full_name}</strong>
                  <span>{formatRelativeTime(currentStory.item.created_at)}</span>
                </div>
              </button>

              <button type="button" className="btn btn-ghost btn-sm" onClick={closeStoryViewer}>
                Close
              </button>
            </div>

            <div className="story-viewer-media">
              {currentStory.item.media_type === 'video' ? (
                <video src={currentStory.item.media_url} controls autoPlay playsInline />
              ) : (
                <img src={currentStory.item.media_url} alt={currentStory.item.caption || 'Story'} />
              )}
            </div>

            {currentStory.item.caption && <p className="story-viewer-caption">{currentStory.item.caption}</p>}

            <div className="story-viewer-footer">
              <button type="button" className="btn btn-secondary" onClick={goToPreviousStoryItem}>
                Previous
              </button>
              <span className="pill">
                {currentStory.itemIndex + 1}/{currentStory.story.items.length}
              </span>
              <button type="button" className="btn btn-primary" onClick={goToNextStoryItem}>
                Next
              </button>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
