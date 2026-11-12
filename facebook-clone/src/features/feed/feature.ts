import type { FeatureDefinition } from '../../extensions/types';
export const feedFeature: FeatureDefinition = {
  id: 'feed',
  composerActions: [
    {
      id: 'live',
      label: 'Live video',
      icon: 'videocam',
      color: '#f3425f',
      run: ({ notify }) =>
        notify(
          'Live video is a preview in this local demo. You can share a photo or write a post instead.',
        ),
    },
    {
      id: 'photo',
      label: 'Photo/video',
      icon: 'images',
      color: '#45bd62',
      run: ({ selectPhoto }) => selectPhoto(),
    },
    {
      id: 'feeling',
      label: 'Feeling/activity',
      icon: 'happy',
      color: '#f7b928',
      run: ({ chooseFeeling }) => chooseFeeling(),
    },
  ],
  postActions: [
    {
      id: 'save',
      label: ({ demo }, post) =>
        demo.state.savedPostIds.includes(post.id) ? 'Unsave post' : 'Save post',
      icon: 'bookmark',
      run: ({ demo }, post) => demo.actions.toggleSavedPost(post.id),
    },
    {
      id: 'open',
      label: () => 'View post',
      icon: 'open',
      run: ({ navigate }, post) => navigate(`/posts/${post.id}`),
    },
  ],
};
