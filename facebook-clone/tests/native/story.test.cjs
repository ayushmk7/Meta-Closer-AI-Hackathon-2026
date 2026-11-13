/* eslint-disable @typescript-eslint/no-require-imports -- Jest native mocks require synchronous module loading. */
const React = require('react');
const renderer = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const mockCreateStory = jest.fn(() => 'local-story-1');
const mockImportPhoto = jest.fn();
jest.mock('../../src/core/store', () => ({
  useDemo: () => ({ actions: { createStory: mockCreateStory } }),
}));
jest.mock('../../src/platform/photo', () => ({ importPhoto: (url) => mockImportPhoto(url) }));
const { usePostStory } = require('../../src/extensions/story');

async function hook() {
  let post;
  const Probe = () => ((post = usePostStory()), null);
  await renderer.act(async () => void renderer.create(React.createElement(Probe)));
  return post;
}
beforeEach(() => mockCreateStory.mockClear());

test('a media key posts a story with the trimmed text', async () => {
  const post = await hook();
  expect(await post({ image: 'pottery', text: '  Wheel night  ' })).toBe('local-story-1');
  expect(mockCreateStory).toHaveBeenCalledWith({ image: 'pottery', text: 'Wheel night' });
});

test('a photo URL is copied into owned storage before posting', async () => {
  const saved = 'file:///doc/facebook-clone-demo/photos/photo-1-1.jpg';
  mockImportPhoto.mockResolvedValueOnce(saved);
  const post = await hook();
  expect(await post({ image: 'http://localhost:8000/static/venues/v.jpg' })).toBe('local-story-1');
  expect(mockCreateStory).toHaveBeenCalledWith({ image: saved, text: undefined });
});

test('a failed download or unknown key posts nothing', async () => {
  mockImportPhoto.mockResolvedValueOnce(null);
  const post = await hook();
  expect(await post({ image: 'http://localhost:8000/missing.jpg' })).toBeNull();
  expect(await post({ image: 'not-a-key' })).toBeNull();
  expect(mockCreateStory).not.toHaveBeenCalled();
});
