export const themes = {
  light: {
    canvas: '#F0F2F5',
    card: '#FFFFFF',
    input: '#F0F2F5',
    text: '#050505',
    secondary: '#65676B',
    divider: '#E4E6EB',
    blue: '#1877F2',
    brand: '#0866FF',
    online: '#31A24C',
    badge: '#E41E3F',
  },
  dark: {
    canvas: '#18191A',
    card: '#242526',
    input: '#3A3B3C',
    text: '#E4E6EB',
    secondary: '#B0B3B8',
    divider: '#3E4042',
    blue: '#4599FF',
    brand: '#0866FF',
    online: '#31A24C',
    badge: '#E41E3F',
  },
};
export type Theme = typeof themes.light;
