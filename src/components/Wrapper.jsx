const SPACE = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
  "4xl": 32,
};

const resolveSpace = (value) => {
  if (value == null) return undefined;
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(SPACE, value)) {
    return SPACE[value];
  }
  return value;
};

const formatSpace = (value) => typeof value === "number" ? `${value}px` : value;

const resolveAxisSpace = (x, y) => {
  if (x == null && y == null) return undefined;
  const xValue = resolveSpace(x ?? 0);
  const yValue = resolveSpace(y ?? 0);
  return `${formatSpace(yValue)} ${formatSpace(xValue)}`;
};

export default function Wrapper({
  as: Comp = "div",
  dir = "column",
  gap,
  padding,
  paddingX,
  paddingY,
  margin,
  marginX,
  marginY,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  align,
  justify,
  wrap = false,
  grow,
  shrink,
  basis,
  columns,
  columnWidth,
  width,
  minWidth,
  maxWidth,
  height,
  minHeight,
  maxHeight,
  overflow,
  overflowX,
  overflowY,
  position,
  top,
  right,
  bottom,
  left,
  inset,
  textAlign,
  flex,
  fullWidth = false,
  onClick,
  onScroll,
  children,
}) {
  const isGrid = columns != null;
  const gridTemplateColumns = typeof columns === "number"
    ? `repeat(${columns}, minmax(${columnWidth || 0}, 1fr))`
    : columns;

  return (
    <Comp
      onClick={onClick}
      onScroll={onScroll}
      style={{
        display: isGrid ? "grid" : "flex",
        flexDirection: isGrid ? undefined : dir,
        gap: resolveSpace(gap),
        padding: paddingX != null || paddingY != null ? resolveAxisSpace(paddingX, paddingY) : resolveSpace(padding),
        margin: marginX != null || marginY != null ? resolveAxisSpace(marginX, marginY) : resolveSpace(margin),
        marginTop: resolveSpace(marginTop),
        marginRight: resolveSpace(marginRight),
        marginBottom: resolveSpace(marginBottom),
        marginLeft: resolveSpace(marginLeft),
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : undefined,
        flexGrow: grow,
        flexShrink: shrink,
        flexBasis: basis,
        flex,
        gridTemplateColumns,
        width: fullWidth ? "100%" : width,
        minWidth,
        maxWidth,
        height,
        minHeight,
        maxHeight,
        overflow,
        overflowX,
        overflowY,
        position,
        top,
        right,
        bottom,
        left,
        inset,
        textAlign,
        boxSizing: "border-box",
      }}
    >
      {children}
    </Comp>
  );
}
