import { BrandMark } from './components/BrandMark';
import { AUTH_STATUS, useAuth } from './lib/authState.js';
import { getSupabaseClient } from './lib/supabase.js';
import { fetchActiveRole } from './lib/authApi.js';
import Popup from './components/Popup.jsx';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

/* Hallmark · shape: Split Studio · genre: modern-minimal · theme: Coral · job: join · nav: masthead · footer: letter close · v2.0.0 */

import './styles/tokens.css';
import './styles/base.css';

import SignInPage from './components/SignInPage.jsx';
import SignUpPage from './components/SignUpPage.jsx';
import ForgotPasswordPage from './components/ForgotPasswordPage.jsx';
import ResetPasswordPage from './components/ResetPasswordPage.jsx';
import RoleRequestPage from './components/RoleRequestPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import DashboardConsumer from './components/DashboardConsumer.jsx';
import DashboardCollector from './components/DashboardCollector.jsx';
import DashboardAggregator from './components/DashboardAggregator.jsx';
import DashboardRecycler from './components/DashboardRecycler.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import DashboardCreateListing from './components/DashboardCreateListing.jsx';
import ListingDetails from './components/ListingDetails.jsx';
import CollectorMarketplace from './components/CollectorMarketplace.jsx';
import CollectorPickups from './components/CollectorPickups.jsx';
import AggregatorInventory from './components/AggregatorInventory.jsx';
import AggregatorLotDetails from './components/AggregatorLotDetails.jsx';
import AggregatorOffers from './components/AggregatorOffers.jsx';
import AggregatorOfferDetails from './components/AggregatorOfferDetails.jsx';
import RecyclerFacility from './components/RecyclerFacility.jsx';
import RecyclerOffers from './components/RecyclerOffers.jsx';
import RecyclerOfferDetails from './components/RecyclerOfferDetails.jsx';
import VerifyHandover from './components/VerifyHandover.jsx';
import { MATERIAL_CARDS } from './lib/materials.js';

const NAV_LINKS = [
  { key: 'home', label: 'Home', href: '/#home' },
  { key: 'how-works', label: 'How it works', href: '/#how-works' },
  { key: 'solution', label: 'Our solution', href: '/#solution' },
  { key: 'stakeholders', label: 'Stakeholders', href: '/#stakeholders' },
  { key: 'contact', label: 'Contact', href: '/#contact' },
];

const STAKEHOLDERS = [
  {
    name: 'Consumer',
    detail: 'List scrap with an estimated weight, see an indicative price and request a pickup.',
    gain: 'A clear record of what was collected and when.',
  },
  {
    name: 'Local Kabadiwala',
    detail: 'Discover pickup requests in the area, accept the ones you can cover and record the actual weight on site.',
    gain: 'Digital pickups and a recorded collection history.',
  },
  {
    name: 'Aggregator',
    detail: 'Receive collected lots, see the weight and condition of each lot, and send one offer at a time to a recycler.',
    gain: 'An inventory built from documented collections.',
  },
  {
    name: 'Recycler',
    detail: 'Review material offers addressed to your facility, confirm the handover and record the final received weight.',
    gain: 'Traceable inbound material and payment status.',
  },
];

const FLOW_STEPS = [
  'Consumer lists scrap with an estimated weight and pickup details.',
  'A local collector accepts the pickup.',
  'The collector records the actual collected weight.',
  "The collected lot enters an aggregator's inventory.",
  'The aggregator sends the lot to a recycler as an offer.',
  'The recycler accepts or declines the offer.',
  'Handover is confirmed, with the received weight and payment status recorded.',
];

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <nav className="nav" aria-label="Main navigation">
      <a className="nav-brand-link" href="/#home" aria-label="RADDIMART home">
        <BrandMark className="nav-brand" />
      </a>
      <div id="site-menu" className={`nav-menu${menuOpen ? ' is-open' : ''}`}>
        <ul className="nav-links">
          {NAV_LINKS.map((link) => (
            <li key={link.key} className="nav-link">
              <a href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>
            </li>
          ))}
        </ul>
        <a className="nav-menu-cta" href="/signup" onClick={() => setMenuOpen(false)}>
          Get started
        </a>
      </div>
      <div className="nav-actions">
        <a className="nav-signin" href="/signin">Sign in</a>
        <a className="btn btn-primary btn-small" href="/signup">Get started</a>
      </div>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={menuOpen}
        aria-controls="site-menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? 'Close menu' : 'Menu'}
      </button>
    </nav>
  );
}

function Hero() {
  return (
    <section className="hero" id="home" aria-label="Hero section">
      <div className="hero-content container">
        <div className="hero-copy">
          <h1 className="hero-headline">Scrap collection that leaves a record</h1>
          <p className="hero-subhead">
            One marketplace linking households, local collectors, aggregators and recyclers,
            from the first listing to the confirmed handover.
          </p>
          <div className="hero-ctas">
            <a href="/signup" className="btn btn-primary">Get started</a>
            <a href="#how-works" className="btn btn-quiet">See how it works</a>
          </div>
        </div>
        <figure className="hero-figure">
          <img
            src="/images/hero-collection.jpg"
            alt="A local scrap collector sorting bundled cardboard, cables and metal beside his collection cart"
            width="1248"
            height="832"
            decoding="async"
          />
          <figcaption className="hero-caption">
            <span className="hero-caption-label">The chain</span>
            <ol className="hero-chain">
              <li><span>01</span>Listing</li>
              <li><span>02</span>Collection</li>
              <li><span>03</span>Handover</li>
            </ol>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="problem-section" id="problem" aria-label="Problem section">
      <div className="container problem-layout">
        <div className="problem-intro">
          <h2 className="section-heading">The challenge</h2>
          <p className="problem-lead">
            India&rsquo;s scrap collection and recycling ecosystem relies on informal local
            collectors and Kabadiwalas who recover recyclable material from households and small
            businesses. The stages of that value chain often operate through disconnected
            networks and undocumented handovers.
          </p>
          <figure className="problem-figure">
            <img
              src="/images/sorting-facility.jpg"
              alt="Bales of cardboard and sorted plastic bottles inside a small material recovery facility"
              width="1248"
              height="832"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Sorting is where value is recovered, and where records usually stop.</figcaption>
          </figure>
        </div>
        <div className="problem-body">
          <p>
            Consumers commonly sell scrap through ad-hoc interactions and may lack reliable
            indicative price benchmarks or convenient pickup coordination. Local Kabadiwalas
            frequently depend on informal buyer networks, with limited digital visibility into
            competing buyers, collection opportunities and structured earning histories.
          </p>
          <p>
            Large aggregators must source material from fragmented upstream collectors, and
            formal recyclers need organised and categorised material streams. E-waste adds a
            further concern, because discarded electronic material may enter unsafe informal
            processing channels.
          </p>
          <div className="chain-gaps">
            <h3>What is missing between the links</h3>
            <ul>
              <li>
                <strong>Price signals</strong>
                <span>Collectors and households rarely see the same benchmark.</span>
              </li>
              <li>
                <strong>Pickup coordination</strong>
                <span>A listing and a collector are not connected in one place.</span>
              </li>
              <li>
                <strong>Handover records</strong>
                <span>Estimates, collected weight and received weight are not kept apart.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section className="solution-section" id="solution" aria-label="Solution section">
      <div className="container solution-layout">
        <div className="solution-content">
          <h2 className="section-heading">Our solution</h2>
          <p>
            RADDIMART is a responsive, web-based, four-stakeholder marketplace connecting
            consumers, local Kabadiwalas, large aggregators and formal recyclers. It digitises
            the movement of scrap from listing and collection to aggregation, recycler offers
            and a verifiable digital handover.
          </p>
          <p>
            Every accepted offer leads to a recorded handover. The final received weight is kept
            separate from the consumer&rsquo;s estimate and the collector&rsquo;s collection record,
            so each stage can be traced back to its source.
          </p>
          <ul className="solution-facts">
            <li>
              <strong>One listing, one record</strong>
              <span>Material, condition, zone and preferred pickup travel with the listing.</span>
            </li>
            <li>
              <strong>Weights kept apart</strong>
              <span>Estimate, collected weight and received weight are distinct fields.</span>
            </li>
            <li>
              <strong>Handover you can check</strong>
              <span>A read-only verification page shows the recorded handover details.</span>
            </li>
          </ul>
        </div>
        <figure className="solution-figure">
          <img
            src="/images/materials/collection.jpg"
            alt="A collector sorting cardboard, cables and recyclable material at a neighbourhood collection point"
            width="1392"
            height="752"
            loading="lazy"
            decoding="async"
          />
          <figcaption>Local collection is where the traceable journey begins.</figcaption>
        </figure>
      </div>
    </section>
  );
}

function MaterialsSection() {
  return (
    <section className="materials-section" id="materials" aria-label="Materials section">
      <div className="container">
        <div className="section-heading-row">
          <h2 className="section-heading">Materials in the chain</h2>
          <p className="materials-intro">
            Four common streams, each with its own handling and recovery path.
          </p>
        </div>
        <div className="material-grid">
          {MATERIAL_CARDS.map((material, index) => (
            <article className={`material-card${index === 0 ? ' material-card-lead' : ''}`} key={material.name}>
              <img
                src={material.src}
                alt={material.alt}
                width="1184"
                height="880"
                loading="lazy"
                decoding="async"
              />
              <div className="material-copy">
                <h3>{material.name}</h3>
                <p>{material.note}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function StakeholderSection() {
  return (
    <section className="stakeholder-section" id="stakeholders" aria-label="Stakeholder section">
      <div className="container">
        <h2 className="section-heading">Four roles, one chain</h2>
        <p className="section-lead">
          Each role sees the part of the journey it is responsible for. The database enforces
          who can read and change what.
        </p>
        <ol className="stakeholder-list">
          {STAKEHOLDERS.map((role, index) => (
            <li key={role.name} className="stakeholder-row">
              <span className="stakeholder-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3>{role.name}</h3>
              <p>{role.detail}</p>
              <p className="stakeholder-gain">{role.gain}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="how-works-section" id="how-works" aria-label="How it works section">
      <div className="container how-works-layout">
        <div className="how-works-intro">
          <h2 className="section-heading">How it works</h2>
          <p>
            A single chain from the household to the recycler, with a record kept at each
            handover.
          </p>
          <div className="form-actions">
            <a href="/signup" className="btn btn-primary">Create an account</a>
            <a href="#stakeholders" className="btn btn-quiet">See the roles</a>
          </div>
        </div>
        <ol className="flow-list">
          {FLOW_STEPS.map((label, index) => (
            <li key={label} className="flow-item">
              <span className="step-number" aria-hidden="true">{index + 1}</span>
              <p>{label}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className="benefits-section" id="benefits" aria-label="Benefits section">
      <div className="container">
        <h2 className="section-heading">Expected benefits</h2>
        <div className="benefits-grid">
          <div className="benefit-column economic">
            <h3>Economic</h3>
            <ul>
              <li>Improved price visibility for households and collectors</li>
              <li>Better buyer discovery across the chain</li>
              <li>More organised sourcing for aggregators</li>
              <li>Structured transaction histories</li>
            </ul>
          </div>
          <div className="benefit-column environmental">
            <h3>Environmental</h3>
            <ul>
              <li>More structured routing of recyclable material</li>
              <li>Better visibility into e-waste movement</li>
              <li>Support for responsible recycling channels</li>
            </ul>
          </div>
          <div className="benefit-column social">
            <h3>Social</h3>
            <ul>
              <li>Digital participation for local Kabadiwalas</li>
              <li>Better transaction visibility for every role</li>
              <li>Improved connectivity across the scrap value chain</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="cta-section" id="cta" aria-label="Call to action section">
      <div className="container cta-layout">
        <div className="cta-content">
          <h2>Be part of a smarter recycling chain</h2>
          <p>
            Join households, collectors, aggregators and recyclers using RADDIMART to make
            scrap collection more transparent and organised.
          </p>
          <div className="cta-buttons">
            <a href="/signup" className="btn btn-primary">Create an account</a>
            <a href="/signin" className="btn btn-secondary">Sign in</a>
          </div>
        </div>
        <img
          className="cta-image"
          src="/images/sorting-facility.jpg"
          alt="A worker checking a bale of cardboard at a material recovery facility"
          width="1248"
          height="832"
          loading="lazy"
          decoding="async"
        />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer" id="contact" aria-label="Page footer">
      <div className="container">
        <div className="footer-brand">
          <BrandMark className="footer-logo" alt="RADDIMART" />
          <span className="footer-tagline">
            Connecting every scrap collector to a greener tomorrow
          </span>
        </div>
        <p className="footer-desc">
          A digital marketplace connecting consumers, local Kabadiwalas, aggregators and
          recyclers for a more transparent recycling chain.
        </p>
        <nav className="footer-links" aria-label="Footer navigation">
          <div>
            <h3>Platform</h3>
            <a href="#how-works">How it works</a>
            <a href="#materials">Materials</a>
            <a href="#benefits">Benefits</a>
          </div>
          <div>
            <h3>Roles</h3>
            <a href="/signup">Consumer</a>
            <a href="/signup">Local Kabadiwala</a>
            <a href="/signup">Recycler</a>
          </div>
          <div>
            <h3>Account</h3>
            <a href="/signin">Sign in</a>
            <a href="/signup">Create an account</a>
            <a href="/forgot-password">Reset password</a>
          </div>
        </nav>
        <p className="footer-copyright">
          © {new Date().getFullYear()} RADDIMART. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        <Popup />
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <MaterialsSection />
        <StakeholderSection />
        <HowItWorksSection />
        <BenefitsSection />
        <CTASection />
        <Footer />
      </main>
    </div>
  );
}

function SignOut() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const finish = () => {
      if (active) navigate('/signin', { replace: true });
    };

    (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const { error } = await supabase.auth.signOut();
        // A revoked, expired or unreachable server session must still clear the
        // local one, otherwise the browser keeps a token that can never be used.
        if (error) await supabase.auth.signOut({ scope: 'local' });
      } catch {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    })()
      .catch(() => {})
      .finally(finish);

    return () => {
      active = false;
    };
  }, [navigate]);

  return null;
}

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { status, user } = useAuth();
  const userId = user?.id;

  // Send authenticated visitors from the landing page to their dashboard.
  // Never hijack the password-recovery screen or the auth pages themselves.
  // The session comes from the shared auth state, so this runs once per signed
  // in visitor instead of a second independent getSession() call.
  useEffect(() => {
    if (pathname !== '/' || status !== AUTH_STATUS.authenticated || !userId) return undefined;
    let active = true;
    fetchActiveRole(getSupabaseClient(), userId).then(({ role }) => {
      if (active && role) navigate(`/dashboard/${role}`, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [pathname, status, userId, navigate]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signout" element={<SignOut />} />
      <Route path="/role-request" element={<ProtectedRoute><RoleRequestPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/dashboard/consumer" element={<ProtectedRoute><DashboardConsumer /></ProtectedRoute>} />
      <Route path="/dashboard/collector" element={<ProtectedRoute><DashboardCollector /></ProtectedRoute>} />
      <Route path="/dashboard/aggregator" element={<ProtectedRoute><DashboardAggregator /></ProtectedRoute>} />
      <Route path="/dashboard/recycler" element={<ProtectedRoute><DashboardRecycler /></ProtectedRoute>} />
      <Route path="/dashboard/create-listing" element={<ProtectedRoute><DashboardCreateListing /></ProtectedRoute>} />
      <Route path="/listing/:id" element={<ProtectedRoute><ListingDetails /></ProtectedRoute>} />
      <Route path="/collector/marketplace" element={<ProtectedRoute><CollectorMarketplace /></ProtectedRoute>} />
      <Route path="/collector/pickups" element={<ProtectedRoute><CollectorPickups /></ProtectedRoute>} />
      <Route path="/aggregator/inventory" element={<ProtectedRoute><AggregatorInventory /></ProtectedRoute>} />
      <Route path="/aggregator/inventory/:id" element={<ProtectedRoute><AggregatorLotDetails /></ProtectedRoute>} />
      <Route path="/aggregator/offers" element={<ProtectedRoute><AggregatorOffers /></ProtectedRoute>} />
      <Route path="/aggregator/offers/:id" element={<ProtectedRoute><AggregatorOfferDetails /></ProtectedRoute>} />
      <Route path="/recycler/facility" element={<ProtectedRoute><RecyclerFacility /></ProtectedRoute>} />
      <Route path="/recycler/offers" element={<ProtectedRoute><RecyclerOffers /></ProtectedRoute>} />
      <Route path="/recycler/offers/:id" element={<ProtectedRoute><RecyclerOfferDetails /></ProtectedRoute>} />
      <Route path="/verify/:token" element={<VerifyHandover />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
