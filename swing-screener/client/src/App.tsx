// src/App.tsx
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { CssBaseline, Snackbar, Alert, Box } from '@mui/material';
import Home from './pages/Home';
import ObservationQueue from './pages/ObservationQueue';
import Dashboard from './components/Dashboard';
import ScannedStocks from './components/ScannedStocks';
import SelectedStocks from './components/SelectedStocks';
import RejectedStocks from './components/RejectedStocks';
import Summary from './components/Summary';
import Navigation from './components/Navigation';
import AskAI from './pages/AskAI';
import MarketOverview from './pages/MarketOverview';
import ProTerminal from './pages/ProTerminal';
import TradeDesk from './pages/TradeDesk';
import DiscoveryFeed from './pages/DiscoveryFeed';
import EquialphaDashboard from './pages/Equialpha';


interface SnackbarState {
  open: boolean;
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

function AppContent(): React.JSX.Element {
  const [snack, setSnack] = useState<SnackbarState>({ open: false, msg: '', severity: 'success' });
  const location = useLocation();

  // Get current page from URL path
  const getCurrentPage = () => {
    const path = location.pathname.substring(1); // Remove leading slash
    return path || 'dashboard';
  };

  const currentPage = getCurrentPage();

  const handleNavigate = (page: string) => {
    // Navigation is handled by React Router
    window.history.pushState({}, '', `/${page}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navigation currentPage={currentPage} onNavigate={handleNavigate} />
        <Box sx={{ flexGrow: 1 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<MarketOverview setSnack={setSnack} />} />
            <Route path="/terminal" element={<ProTerminal setSnack={setSnack} />} />
            <Route path="/trade" element={<TradeDesk setSnack={setSnack} />} />
            <Route path="/feed" element={<DiscoveryFeed setSnack={setSnack} />} />
            <Route path="/dashboard" element={<Dashboard setSnack={setSnack} />} />
            <Route path="/scan" element={<Home setSnack={setSnack} />} />
            <Route path="/observations" element={<ObservationQueue setSnack={setSnack} />} />
            <Route path="/scanned" element={<ScannedStocks setSnack={setSnack} />} />
            <Route path="/selected" element={<SelectedStocks setSnack={setSnack} />} />
            <Route path="/rejected" element={<RejectedStocks setSnack={setSnack} />} />
            <Route path="/summary" element={<Summary setSnack={setSnack} />} />
            <Route path="/ask-ai" element={<AskAI setSnack={setSnack} />} />
            <Route path="/equialpha" element={<EquialphaDashboard />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </Box>
      </Box>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ open: false, msg: '', severity: 'success' })}>
        <Alert severity={snack.severity}>{snack.msg}</Alert>
      </Snackbar>
    </>
  );
}

function App(): React.JSX.Element {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
