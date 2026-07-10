import { type FunctionComponent } from 'preact';
import { hasCards } from './state/app-state';
import { Header } from './components/Header';
import { CardLoader } from './components/CardLoader';
import { CardsSidebar } from './components/CardsSidebar';
import { CardViewer } from './components/CardViewer';
import { CardInspector } from './components/CardInspector';
import { SyncModal } from './components/SyncModal';
import { ToastContainer } from './components/Toast';

export const App: FunctionComponent = () => (
  <>
    <Header />
    <main class="app-main">
      {!hasCards.value ? (
        <CardLoader />
      ) : (
        <>
          <CardsSidebar />
          <CardViewer />
          <CardInspector />
        </>
      )}
    </main>
    <SyncModal />
    <ToastContainer />
  </>
);
