export const Fonts = {
  inter: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  serif: 'PlayfairDisplay_600SemiBold',
} as const;

export const MiaTypography = {
  serifTitle: (size = 28) => ({
    fontFamily: Fonts.serif,
    fontSize: size,
    color: '#151012',
    lineHeight: size * 1.1,
  }),
  body: (size = 15) => ({
    fontFamily: Fonts.inter,
    fontSize: size,
    lineHeight: size * 1.4,
  }),
  label: {
    fontFamily: Fonts.interSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#9A8589',
  },
  caption: {
    fontFamily: Fonts.inter,
    fontSize: 11,
    letterSpacing: 0.3,
    color: '#9A8589',
  },
};
