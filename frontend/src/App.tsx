import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { HomePage } from './pages/HomePage';
import { OnboardingPage } from './pages/OnboardingPage';
import PortfolioPage from './pages/PortfolioPage';
import { ProfileEditPage } from './pages/ProfileEditPage';
import { ProfilePage } from './pages/ProfilePage';

function App() {
  return (
    <BrowserRouter>
      <div className="site-aurora" aria-hidden="true">
        <span className="site-aurora-band site-aurora-band-1" />
        <span className="site-aurora-band site-aurora-band-2" />
        <span className="site-aurora-band site-aurora-band-3" />
      </div>
      <div className="app-frame">
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
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
