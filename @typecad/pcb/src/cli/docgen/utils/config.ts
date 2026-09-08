export const PCBConfig = {
  colors: {
    fr4: '#6d744b',
    ptfe: '#fcfcfa',
    polyimide: '#cd8200',
    phenolic: '#5c1106',
    aluminum: '#d5d5d5',
    silkscreen: '#FFFFFF',
    solderMask: '#00A650',
    copper: '#FF8C00',
    default: '#808080',
  },
  dimensions: {
    defaultWidth: 2000,
    padding: 20,
    layerWidth: 200,
    labelOffset: 140,
  },
  layerHeights: {
    silkscreen: 3,
    paste: 3,
    mask: 3,
    copper: 5,
    core: 25,
    prepreg: 20,
    default: 10,
  },
};

export const SVGConfig = {
  styles: {
    layerText: 'font-family: Arial; font-size: 14px;',
    title: 'font-family: Arial; font-size: 18px; font-weight: bold;',
    connectorLine: 'stroke: #666; stroke-width: 1;',
  },
};

export const CacheConfig = {
  maxSize: 100,
  ttl: 1800000,
};
