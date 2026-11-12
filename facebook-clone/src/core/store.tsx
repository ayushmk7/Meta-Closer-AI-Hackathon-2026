import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { seed } from '../data/seed';
import { resetHooks } from '../extensions/registry';
import { storage } from '../platform/storage';
import { clearOwnedPhotos, reconcileOwnedPhotos } from '../platform/photo';
import { createPersistence } from './persistence';
import {
  audiences,
  ownedPhotoRefs,
  friendIds,
  initialState,
  knownConversation,
  reduceDemo,
  searchContent,
  selectMessages,
  selectNotifications,
  selectPerson,
  selectPosts,
  selectStories,
  validMedia,
  type DemoAction,
} from './model';
import type { DemoActions, DemoContextValue, DemoState } from './types';

const Context = createContext<DemoContextValue | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceDemo, undefined, initialState);
  const stateRef = useRef<DemoState>(state);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const resetting = useRef(false);
  const resetPending = useRef<Promise<void> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const persistence = useMemo(() => createPersistence(storage, setError), []);

  useEffect(() => {
    let active = true;
    persistence
      .load()
      .then(async (restored) => {
        if (!active) return;
        stateRef.current = restored;
        dispatch({ type: 'replace', value: restored });
        const photos = await reconcileOwnedPhotos(ownedPhotoRefs(restored));
        if (!active) return;
        if (photos.missing)
          setError(
            'Some previously added photos are no longer available on this device. Your posts and other changes are intact.',
          );
        else if (photos.cleanupFailed)
          setError(
            'Some unused demo photo files could not be cleaned up. Your saved content is intact.',
          );
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : 'Saved data is unavailable. Changes will remain in this session until storage is available.',
          );
      })
      .finally(() => {
        if (active) {
          readyRef.current = true;
          setReady(true);
        }
      });
    return () => {
      active = false;
      readyRef.current = false;
    };
  }, [persistence]);

  const apply = useCallback(
    (action: DemoAction) => {
      if (!readyRef.current || resetting.current) return false;
      const next = reduceDemo(stateRef.current, action);
      if (next === stateRef.current) return false;
      stateRef.current = next;
      dispatch(action);
      persistence.save(next);
      return true;
    },
    [persistence],
  );

  const actions = useMemo<DemoActions>(
    () => ({
      createPost(input) {
        const text = input.text.trim();
        if (
          !text ||
          text.length > 5000 ||
          !audiences.includes(input.audience) ||
          (input.photo && !validMedia(input.photo))
        ) {
          setError(
            'Add a post between 1 and 5,000 characters and choose a supported audience or local photo.',
          );
          return null;
        }
        const id = `local-post-${stateRef.current.nextId}`;
        return apply({
          type: 'post',
          post: {
            id,
            authorId: seed.viewerId,
            text,
            audience: input.audience,
            photos: input.photo ? [input.photo] : [],
            time: 'Just now',
            createdAt: Date.now(),
            reactionCount: 0,
            comments: [],
          },
        })
          ? id
          : null;
      },
      createStory(input) {
        const id = `local-story-${stateRef.current.nextId}`;
        if (!validMedia(input.image) || (input.text?.length ?? 0) > 500) {
          setError('Choose a local photo and a caption shorter than 500 characters.');
          return '';
        }
        return apply({
          type: 'story',
          story: { id, authorId: seed.viewerId, image: input.image, text: input.text?.trim() },
        })
          ? id
          : '';
      },
      toggleReaction(postId, reaction) {
        apply({ type: 'reaction', postId, reaction });
      },
      addComment(postId, value) {
        const text = value.trim();
        if (!text) return;
        if (text.length > 2000) {
          setError('Keep comments under 2,000 characters.');
          return;
        }
        apply({
          type: 'comment',
          postId,
          comment: {
            id: `local-comment-${stateRef.current.nextId}`,
            authorId: seed.viewerId,
            text,
            time: 'Just now',
          },
        });
      },
      toggleSavedPost(postId) {
        apply({ type: 'savePost', postId });
      },
      toggleSavedListing(listingId) {
        apply({ type: 'saveListing', listingId });
      },
      decideRequest(requestId, decision) {
        apply({ type: 'request', requestId, decision });
      },
      requestFriend(personId) {
        apply({ type: 'sendRequest', personId });
      },
      markNotificationRead(id) {
        apply({ type: 'read', ids: [id] });
      },
      markAllNotificationsRead() {
        apply({
          type: 'read',
          ids: selectNotifications(stateRef.current).map((notification) => notification.id),
        });
      },
      sendMessage(conversationId, value) {
        const text = value.trim();
        if (!text) return;
        if (text.length > 2000 || !knownConversation(conversationId)) {
          setError('Choose a demo conversation and keep messages under 2,000 characters.');
          return;
        }
        apply({
          type: 'message',
          conversationId,
          message: {
            id: `local-message-${stateRef.current.nextId}`,
            authorId: seed.viewerId,
            text,
            time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          },
        });
      },
      updateSettings(patch) {
        apply({ type: 'settings', patch });
      },
      updateProfile(patch) {
        if (!apply({ type: 'profile', patch }))
          setError('Profile details must be shorter than 500 characters and use local photos.');
      },
      reset() {
        if (resetPending.current) return resetPending.current;
        resetting.current = true;
        resetPending.current = (async () => {
          try {
            await persistence.reset();
            const fresh = initialState();
            stateRef.current = fresh;
            dispatch({ type: 'replace', value: fresh });
            setError(null);
            try {
              await clearOwnedPhotos();
            } catch {
              setError(
                'Demo state was reset, but some demo photo files could not be removed. Try resetting again to clean them up.',
              );
            }
            for (const hook of resetHooks) {
              try {
                await hook.run();
              } catch {
                setError(
                  `Demo was reset, but ${hook.id} data could not be cleared. Try resetting again.`,
                );
              }
            }
          } catch {
            const failure = new Error(
              'The demo could not be reset because local storage is unavailable. Your current session is unchanged.',
            );
            setError(failure.message);
            throw failure;
          } finally {
            resetting.current = false;
            resetPending.current = null;
          }
        })();
        return resetPending.current;
      },
    }),
    [apply, persistence],
  );

  const value = useMemo<DemoContextValue>(() => {
    const notifications = selectNotifications(state);
    return {
      seed,
      state,
      ready,
      error,
      actions,
      clearError: () => setError(null),
      posts: selectPosts(state),
      stories: selectStories(state),
      friends: friendIds(state).map((id) => selectPerson(state, id)),
      requests: seed.requests.filter((request) => !state.requestDecisions[request.id]),
      notifications,
      unreadCount: notifications.filter((notification) => !notification.read).length,
      person: (id) => selectPerson(state, id),
      messages: (id) => selectMessages(state, id),
      conversationFor: (personId) => `chat-${personId}`,
      search: (query) => searchContent(state, query),
    };
  }, [state, ready, error, actions]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDemo(): DemoContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useDemo must be used inside DemoProvider.');
  return value;
}
