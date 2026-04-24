import { createTheme } from '@mui/material/styles';

export const muiTheme = createTheme({
  palette: {
    primary: {
      main: '#0F766E', // Teal/turquoise (used in current AppLayout)
      light: '#14B8A6',
      dark: '#0D5F5A',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#8E33FF',
      light: '#A855FF',
      dark: '#7C2AE8',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#F23645',
    },
    warning: {
      main: '#FFC107',
    },
    info: {
      main: '#00BCD4',
    },
    success: {
      main: '#10B981',
    },
    background: {
      default: '#F4F6F8',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1F2937',
      secondary: '#6B7280',
    },
  },
  typography: {
    fontFamily: [
      'Geist Variable',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h3: {
      fontSize: '1.875rem',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 700,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 700,
      lineHeight: 1.5,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 0 2px 0 rgba(145,158,171,0.2), 0 12px 24px -4px rgba(145,158,171,0.12)',
          borderRadius: 8,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#1F2937',
          boxShadow: '0 0 2px 0 rgba(145,158,171,0.2), 0 2px 4px -2px rgba(145,158,171,0.12)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: '#E5E7EB',
        },
        head: {
          backgroundColor: '#F9FAFB',
          fontWeight: 600,
          color: '#1F2937',
        },
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
});
