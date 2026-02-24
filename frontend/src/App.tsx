import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { ExplorePage } from './pages/ExplorePage';
import { HomePage } from './pages/HomePage';
import { JoinBatchPage } from './pages/JoinBatchPage';
import { OnboardingPage } from './pages/OnboardingPage';
import PortfolioPage from './pages/PortfolioPage';
import { ProfileEditPage } from './pages/ProfileEditPage';
import { ProfilePage } from './pages/ProfilePage';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="site-aurora" aria-hidden="true">
        <span className="site-aurora-band site-aurora-band-1" />
        <span className="site-aurora-band site-aurora-band-2" />
        <span className="site-aurora-band site-aurora-band-3" />
      </div>
      <div className="app-frame">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/join/:inviteCode" element={<JoinBatchPage />} />
          <Route path="/join/batch/:batchId" element={<JoinBatchPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/onboard" element={<OnboardingPage />} />
          <Route path="/app" element={<DirectoryPage />} />
          <Route path="/directory" element={<Navigate to="/app" replace />} />
          <Route path="/profile/:userId" element={<ProfilePage />} />
          <Route path="/profile/edit" element={<ProfileEditPage />} />
          <Route path="/resume" element={<PortfolioPage />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
