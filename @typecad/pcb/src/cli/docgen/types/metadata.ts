export interface IMetadata {
  highlight: string;
  stylesheet: string;
  title: string;
  company: string;
  board_name: string;
  variant: string;
  filename: string;
  revision: string;
  date: string;
  kicad_theme: string;
  dark_mode: boolean;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDefaultMetadata(): IMetadata {
  return {
    highlight: 'github-light',
    stylesheet: '',
    title: '',
    company: '',
    board_name: '',
    variant: '',
    filename: '',
    revision: '',
    date: today(),
    kicad_theme: 'KiCAD Default',
    dark_mode: false,
  };
}

export const defaultMetadata: IMetadata = getDefaultMetadata();
