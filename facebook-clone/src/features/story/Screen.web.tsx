import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageUri } from '../../data/media';
import { Avatar, Empty, Icon, Nav } from '../../ui/Controls.web';
export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories, person } = useDemo();
  const index = stories.findIndex((story) => story.id === id),
    story = stories[index];
  if (!story)
    return (
      <Empty
        title="Story not found"
        text="Go Home to see stories from your friends."
        icon="photo"
      />
    );
  return (
    <section className="story-viewer">
      <Nav href="/" className="story-close icon-button" aria-label="Close story">
        <Icon name="close" />
      </Nav>
      <div className="story-canvas">
        <img
          className="story-full-image"
          src={imageUri(story.image)}
          alt={`${person(story.authorId).name}'s story`}
        />
        <div className="story-progress">
          {stories.map((item) => (
            <span key={item.id} className={item.id === id ? 'active' : ''} />
          ))}
        </div>
        <Nav href={`/profile/${story.authorId}`} className="story-owner">
          <Avatar person={person(story.authorId)} />
          <strong>{person(story.authorId).name}</strong>
        </Nav>
        {story.text && <p className="story-caption">{story.text}</p>}
        <Nav
          href={`/stories/${stories[(index + stories.length - 1) % stories.length].id}`}
          className="story-previous icon-button"
          aria-label="Previous story"
        >
          <Icon name="back" />
        </Nav>
        <Nav
          href={`/stories/${stories[(index + 1) % stories.length].id}`}
          className="story-next icon-button"
          aria-label="Next story"
        >
          <Icon name="chevron" />
        </Nav>
      </div>
    </section>
  );
}
