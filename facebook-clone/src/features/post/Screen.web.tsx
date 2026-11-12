import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { Empty, PageTitle } from '../../ui/Controls.web';
import { PostCard } from '../feed/index.web';
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts } = useDemo();
  const post = posts.find((item) => item.id === id);
  return (
    <div className="narrow-page">
      <PageTitle title="Post" back />
      {post ? (
        <PostCard post={post} expanded />
      ) : (
        <Empty
          title="Post not found"
          text="This post is no longer available in your local demo."
          icon="feeds"
        />
      )}
    </div>
  );
}
