import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  MenuRounded,
  CloseRounded,
  TrendingUpRounded,
  StorageRounded,
} from '@mui/icons-material';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: 'Daily Picks',
    path: '/',
    icon: <TrendingUpRounded />,
  },
  {
    label: 'Knowledge Base',
    path: '/kb',
    icon: <StorageRounded />,
  },
];

const APPBAR_HEIGHT = 64;
const DRAWER_WIDTH = 240;

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <Box>
      <List sx={{ pt: 2 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              href={item.path}
              selected={isActive}
              onClick={() => setMobileOpen(false)}
              sx={{
                mx: 1,
                my: 0.5,
                borderRadius: 6,
                color: isActive ? '#0F766E' : '#6B7280',
                backgroundColor: isActive ? '#F0FDFA' : 'transparent',
                '&:hover': {
                  backgroundColor: isActive ? '#E0FDFB' : '#F9FAFB',
                },
              }}
            >
              <ListItemIcon sx={{ color: isActive ? '#0F766E' : '#9CA3AF', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.95rem', fontWeight: isActive ? 600 : 500 }} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#FAFAFA' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: '100%',
          height: APPBAR_HEIGHT,
          zIndex: 1200,
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Toolbar sx={{ height: APPBAR_HEIGHT }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' }, color: '#1F2937' }}
          >
            {mobileOpen ? <CloseRounded /> : <MenuRounded />}
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: '#FFFFFF',
              }}
            >
              ⚡
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1F2937', fontSize: '1.3rem' }}>
              TrackWise
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.9rem', fontWeight: 500 }}>
            Paper Trading System
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            marginTop: `${APPBAR_HEIGHT}px`,
            height: `calc(100vh - ${APPBAR_HEIGHT}px)`,
            borderRight: '1px solid #E5E7EB',
            backgroundColor: '#FFFFFF',
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH,
          },
        }}
      >
        {drawer}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          marginTop: `${APPBAR_HEIGHT}px`,
          p: 3,
          minHeight: `calc(100vh - ${APPBAR_HEIGHT}px)`,
          backgroundColor: '#FAFAFA',
          width: { xs: '100%', sm: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default AppLayout;
