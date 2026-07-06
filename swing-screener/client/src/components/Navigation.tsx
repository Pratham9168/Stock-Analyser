import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Avatar,
  Badge,
  Menu,
  MenuItem,
  Chip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Assessment,
  AccountBalance,
  Timeline,
  Settings,
  Notifications,
  Person,
  Logout,
  TrendingUp,
  TrendingDown,
  BarChart,
  PieChart,
  TableChart,
  FilterList,
  Search,
  Analytics,
  Speed,
  Security,
  Psychology,
  SmartToy,
  Explore
} from '@mui/icons-material';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();

  const menuItems = [
    { id: 'equialpha', label: 'Equialpha Platform', icon: <Explore />, color: 'primary' },
    { id: 'overview', label: 'Market Overview', icon: <Dashboard />, color: 'primary' },
    { id: 'terminal', label: 'Pro Terminal', icon: <Analytics />, color: 'secondary' },
    { id: 'trade', label: 'Trade Desk', icon: <AccountBalance />, color: 'success' },
    { id: 'feed', label: 'Discovery Feed', icon: <Explore />, color: 'info' },
    { id: 'dashboard', label: 'Pro Scanner', icon: <Search />, color: 'warning' },
    { id: 'scan', label: 'Run New Scan', icon: <Assessment />, color: 'info' },
    { id: 'observations', label: 'AI Queue', icon: <Psychology />, color: 'secondary' },
    { id: 'scanned', label: 'All Scanner Stocks', icon: <TableChart />, color: 'secondary' },
    { id: 'selected', label: 'Selected Stocks', icon: <TrendingUp />, color: 'success' },
    { id: 'rejected', label: 'Rejected Stocks', icon: <TrendingDown />, color: 'error' },
    { id: 'summary', label: 'Performance Summary', icon: <BarChart />, color: 'info' },
    { id: 'ask-ai', label: 'Ask AI', icon: <SmartToy />, color: 'primary' }
  ];

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const drawer = (
    <Box sx={{ width: 280 }}>
      <Box sx={{ p: 3, backgroundColor: 'primary.main', color: 'white' }}>
        <Box display="flex" alignItems="center" mb={2}>
          <Avatar sx={{ mr: 2, backgroundColor: 'white', color: 'primary.main' }}>
            <Analytics />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Stock Analysis Pro
            </Typography>
            <Typography variant="body2" color="rgba(255,255,255,0.8)">
              Professional Trading Dashboard
            </Typography>
          </Box>
        </Box>
        <Chip
          label="Live"
          color="success"
          size="small"
          sx={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
        />
      </Box>

      <List sx={{ p: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={currentPage === item.id}
              onClick={() => {
                navigate(`/${item.id}`);
                setDrawerOpen(false);
              }}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  backgroundColor: `${item.color}.main`,
                  color: 'white',
                  '&:hover': {
                    backgroundColor: `${item.color}.dark`,
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'white',
                  },
                },
                '&:hover': {
                  backgroundColor: `${item.color}.light`,
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontWeight: currentPage === item.id ? 'bold' : 'normal'
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ mx: 2 }} />

      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Quick Stats
        </Typography>
        <Box display="flex" justifyContent="space-between" mb={1}>
          <Typography variant="body2">Portfolio Value:</Typography>
          <Typography variant="body2" fontWeight="bold" color="success.main">
            ₹7.74L
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" mb={1}>
          <Typography variant="body2">Today's P&L:</Typography>
          <Typography variant="body2" fontWeight="bold" color="success.main">
            +₹1,250
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between">
          <Typography variant="body2">Active Positions:</Typography>
          <Typography variant="body2" fontWeight="bold">
            3
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <>
      <AppBar position="sticky" sx={{ backgroundColor: 'white', color: 'text.primary', boxShadow: 1 }}>
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            onClick={() => setDrawerOpen(true)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          <Box display="flex" alignItems="center" flexGrow={1}>
            <Avatar sx={{ mr: 2, backgroundColor: 'primary.main' }}>
              <Analytics />
            </Avatar>
            <Box>
              <Typography variant="h6" fontWeight="bold" color="primary">
                Stock Analysis Pro
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Professional Trading Dashboard
              </Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <IconButton color="inherit">
              <Badge badgeContent={3} color="error">
                <Notifications />
              </Badge>
            </IconButton>

            <IconButton color="inherit" onClick={handleProfileMenuOpen}>
              <Avatar sx={{ width: 32, height: 32, backgroundColor: 'primary.main' }}>
                <Person />
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: 280,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawer}
      </Drawer>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <Person fontSize="small" />
          </ListItemIcon>
          <ListItemText>Profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default Navigation;
