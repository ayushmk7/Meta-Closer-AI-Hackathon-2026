import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useDemo } from '../../core/store';
import { imageUri } from '../../data/media';
import type { Listing } from '../../core/types';
import { Avatar, Empty, Icon, Nav, PageTitle } from '../../ui/Controls.web';
export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Nav href={`/marketplace/${listing.id}`} className="listing-card">
      <img src={imageUri(listing.image)} alt={listing.title} loading="lazy" />
      <strong>${listing.price}</strong>
      <span>{listing.title}</span>
      <small>{listing.location}</small>
    </Nav>
  );
}
export default function MarketplaceScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { seed, state, actions, person, conversationFor } = useDemo();
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('All'),
    [tab, setTab] = useState('For you'),
    [price, setPrice] = useState('all');
  const categories = ['All', ...new Set(seed.listings.map((listing) => listing.category))];
  if (id) {
    const listing = seed.listings.find((item) => item.id === id);
    if (!listing)
      return (
        <Empty
          title="Listing not found"
          text="Browse Marketplace to find something you love."
          icon="marketplace"
        />
      );
    const seller = person(listing.sellerId);
    return (
      <div className="listing-detail-page">
        <PageTitle title="Marketplace" back />
        <div className="listing-detail">
          <div className="listing-large-photo">
            <img src={imageUri(listing.image)} alt={listing.title} />
          </div>
          <section className="listing-description">
            <h1>{listing.title}</h1>
            <p className="listing-price">${listing.price}</p>
            <p className="muted">Listed in {listing.location}</p>
            <div className="listing-detail-actions">
              <Nav
                className="button primary"
                href={`/messages/${conversationFor(seller.id)}?listing=${listing.id}`}
              >
                <Icon name="messenger" size={20} />
                Message seller
              </Nav>
              <button
                className="button neutral"
                aria-label={state.savedListingIds.includes(id) ? 'Unsave listing' : 'Save listing'}
                onClick={() => actions.toggleSavedListing(id)}
              >
                <Icon name="saved" />
                {state.savedListingIds.includes(id) ? 'Saved' : 'Save'}
              </button>
            </div>
            <h2>Details</h2>
            <dl className="listing-facts">
              <dt>Condition</dt>
              <dd>{listing.condition}</dd>
              <dt>Category</dt>
              <dd>{listing.category}</dd>
            </dl>
            <p>{listing.description}</p>
            <div className="location-card">
              <Icon name="location" size={30} />
              <strong>{listing.location}</strong>
              <small>Approximate location</small>
            </div>
            <div className="section-heading">
              <h2>Seller information</h2>
              <Nav href={`/profile/${seller.id}`}>Seller details</Nav>
            </div>
            <Nav className="person-line" href={`/profile/${seller.id}`}>
              <Avatar person={seller} size={48} />
              <strong>{seller.name}</strong>
            </Nav>
          </section>
        </div>
      </div>
    );
  }
  const shown = seed.listings.filter(
    (listing) =>
      `${listing.title} ${listing.description}`.toLowerCase().includes(query.toLowerCase()) &&
      (category === 'All' || listing.category === category) &&
      (tab !== 'Saved' || state.savedListingIds.includes(listing.id)) &&
      (tab !== 'Local' || listing.location === seed.listings[0].location) &&
      (price === 'all' || listing.price <= Number(price)),
  );
  return (
    <div className="section-layout">
      <aside className="section-sidebar marketplace-sidebar">
        <h1>Marketplace</h1>
        <label className="search-input">
          <Icon name="search" size={18} />
          <input
            aria-label="Search Marketplace"
            placeholder="Search Marketplace"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className={`section-nav-row ${tab === 'For you' ? 'active' : ''}`}
          onClick={() => setTab('For you')}
        >
          <span className="menu-icon">
            <Icon name="marketplace" />
          </span>
          <strong>Browse all</strong>
        </button>
        <button
          className={`section-nav-row ${tab === 'Saved' ? 'active' : ''}`}
          onClick={() => setTab('Saved')}
        >
          <span className="menu-icon">
            <Icon name="saved" />
          </span>
          <strong>Saved listings</strong>
        </button>
        <div className="rail-divider" />
        <h3>Filters</h3>
        <p className="blue">
          <strong>San Francisco, California · Local</strong>
        </p>
        <label className="filter-label">
          Maximum price
          <select
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label="Maximum price"
          >
            <option value="all">Any price</option>
            <option value="50">$50</option>
            <option value="100">$100</option>
            <option value="300">$300</option>
          </select>
        </label>
        <div className="rail-divider" />
        <h3>Categories</h3>
        {categories.map((value) => (
          <button
            key={value}
            className={`section-nav-row ${category === value ? 'active' : ''}`}
            onClick={() => setCategory(value)}
          >
            <span className="menu-icon">
              <Icon name={value === 'All' ? 'marketplace' : 'groups'} />
            </span>
            <strong>{value === 'All' ? 'All categories' : value}</strong>
          </button>
        ))}
      </aside>
      <div className="section-content marketplace-content">
        <div className="mobile-marketplace-controls">
          <PageTitle title="Marketplace" />
          <label className="search-input">
            <Icon name="search" size={18} />
            <input
              aria-label="Search listings"
              placeholder="Search Marketplace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="chip-row">
            {['For you', 'Local', 'Saved'].map((value) => (
              <button
                key={value}
                className={`chip ${tab === value ? 'active' : ''}`}
                onClick={() => setTab(value)}
              >
                {value}
              </button>
            ))}
            <select
              aria-label="Listing category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="section-heading marketplace-heading">
          <h2>{tab === 'Saved' ? 'Saved listings' : 'Today’s picks'}</h2>
          <span className="blue">
            <Icon name="location" size={16} />
            San Francisco · Local
          </span>
        </div>
        {shown.length ? (
          <div className="marketplace-grid">
            {shown.map((listing) => (
              <ListingCard listing={listing} key={listing.id} />
            ))}
          </div>
        ) : (
          <Empty
            title={tab === 'Saved' ? 'No saved listings yet' : 'No listings found'}
            text={
              tab === 'Saved'
                ? 'Save something you like to find it here later.'
                : 'Try another search or clear a filter.'
            }
            icon="marketplace"
          />
        )}
      </div>
    </div>
  );
}
