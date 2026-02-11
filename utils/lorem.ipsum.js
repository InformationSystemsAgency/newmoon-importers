/**
 * Lorem ipsum text in the given language
 * @param {'en' | 'hy'} lang - Language code
 * @returns {string} Lorem ipsum text in the given language
 */

export const loremIpsum = (lang) => {
  if (lang === 'en') {
    return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  } else if (lang === 'hy') {
    return 'Լորեմ իպսում դոլոր սիտ ամեթ, սեդ դո եյսումոդ թեմպոր ինքդինտիդունտ ուտ լաբոր եթ դոլոր մագանա ալիկա.';
  }
  return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
};