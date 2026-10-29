import type {
  ImageProps,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Image, StyleSheet, View } from 'react-native';

type Props = Readonly<Omit<ImageProps, 'source' | 'style' | 'resizeMode'> & {
  source: ImageSourcePropType;
  // Frame ratio, max width and optional max height come from tokens/acceptance.
  aspectRatio: number;
  maxWidth: number;
  maxHeight?: number;
  resizeMode: 'cover' | 'contain';
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}>;

// Pass onLayout (e.g. from useLayoutEvidence) to measure the Image itself; it
// fills the frame, so its layout is the frame geometry.
export function ResponsiveImage({
  source,
  aspectRatio,
  maxWidth,
  maxHeight,
  resizeMode,
  containerStyle,
  imageStyle,
  ...imageProps
}: Props) {
  // Turn a height cap into a width cap so the frame keeps its ratio in wide,
  // short windows instead of being clipped vertically.
  const frameMaxWidth =
    maxHeight === undefined ? maxWidth : Math.min(maxWidth, maxHeight * aspectRatio);

  return (
    <View
      style={[styles.container, containerStyle, { aspectRatio, maxWidth: frameMaxWidth }]}
    >
      <Image
        {...imageProps}
        resizeMode={resizeMode}
        source={source}
        style={[imageStyle, styles.image]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  // Static require() assets get their intrinsic {width, height} merged before
  // props.style; without explicit size the image ignores absoluteFill edges.
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
