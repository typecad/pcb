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

export const defaultMetadata: IMetadata = {
    highlight: 'github-light',
    stylesheet: '',
    title: '',
    company: '',
    board_name: '',
    variant: '',
    filename: '',
    revision: '',
    date: new Date().toISOString().split('T')[0],
    kicad_theme: 'KiCAD Default',
    dark_mode: false
}; 