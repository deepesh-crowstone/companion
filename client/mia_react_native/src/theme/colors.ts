export const MiaColors = {
  background: '#FFF0F3',
  chatBackground: '#FFF6F8',
  backgroundDeep: '#FCE8EC',
  surface: '#FFFFFF',
  miaBubble: '#F9DDE3',
  userBubble: '#4A3F42',
  textPrimary: '#2D2323',
  miaText: '#151012',
  textMuted: '#9A8589',
  accent: '#E8899A',
  accentLight: '#F5B8C4',
  accentDeep: '#B04A5A',
  statusPink: '#D48494',
  online: '#4CD964',
  errorBg: '#3D2A2E',
  callGradientTop: '#B85A6B',
  callGradientMid: '#5A2430',
  callGradientBottom: '#2A0F14',
} as const;

export const bubbleRadius = 22;
export const bubbleTail = 6;

export function bubbleBorderRadius(isUser: boolean) {
  return {
    borderTopLeftRadius: bubbleRadius,
    borderTopRightRadius: bubbleRadius,
    borderBottomLeftRadius: isUser ? bubbleRadius : bubbleTail,
    borderBottomRightRadius: isUser ? bubbleTail : bubbleRadius,
  };
}
