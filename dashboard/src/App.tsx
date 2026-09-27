import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminKeyPrompt } from './components/AdminKeyPrompt';
import { LocationsProvider } from './contexts/LocationsContext';
import { Layout } from './components/Layout';
import { AddBusinessPage } from './pages/AddBusinessPage';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage';
import { ContactSubmissionsPage } from './pages/ContactSubmissionsPage';
import { DesignsPage } from './pages/DesignsPage';
import { DailyJobPage } from './pages/DailyJobPage';
import { FormSubmissionTestPage } from './pages/FormSubmissionTestPage';
import { GeneratedSitesPage } from './pages/GeneratedSitesPage';
import { GhlStatusPage } from './pages/GhlStatusPage';
import { IndustrySchemasPage } from './pages/IndustrySchemasPage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { OverviewPage } from './pages/OverviewPage';
import { PostsPage } from './pages/PostsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SocialPage } from './pages/SocialPage';

export default function App() {
  return (
    <BrowserRouter>
      <AdminKeyPrompt />
      <LocationsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<OverviewPage />} />
            <Route path="add-business" element={<AddBusinessPage />} />
            <Route path="posts" element={<PostsPage />} />
            <Route path="daily-job" element={<DailyJobPage />} />
            <Route path="ghl-status" element={<GhlStatusPage />} />
            <Route path="media" element={<MediaLibraryPage />} />
            <Route path="approval" element={<ApprovalQueuePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="designs" element={<DesignsPage />} />
            <Route path="sites" element={<GeneratedSitesPage />} />
            <Route path="industry-schemas" element={<IndustrySchemasPage />} />
            <Route path="contacts" element={<ContactSubmissionsPage />} />
            <Route path="form-test" element={<FormSubmissionTestPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LocationsProvider>
    </BrowserRouter>
  );
}
