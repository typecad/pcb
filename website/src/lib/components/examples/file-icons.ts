// Maps a file name to an Iconify icon name in the `catppuccin:` set, matching
// the folder icon already used elsewhere on the site. Falls back to a generic
// file icon. Names were verified against the Iconify API (all return 200).

export function fileIconFor(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'catppuccin:typescript';
    case 'tsx':
      return 'catppuccin:tsx';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'catppuccin:javascript';
    case 'jsx':
      return 'catppuccin:jsx';
    case 'json':
      return 'catppuccin:json';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
    case 'h':
    case 'ino':
    case 'c':
      return 'catppuccin:cpp';
    case 'css':
      return 'catppuccin:css';
    case 'html':
    case 'htm':
      return 'catppuccin:html';
    case 'md':
    case 'markdown':
      return 'catppuccin:markdown';
    case 'yaml':
    case 'yml':
      return 'catppuccin:yaml';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'catppuccin:shell';
    case 'xml':
      return 'catppuccin:xml';
    default:
      return 'catppuccin:text';
  }
}
