import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ListRenderItem, ViewToken } from 'react-native';
import { FlatList, StyleSheet, View } from 'react-native';

type KeyedItem = Readonly<{ id: string }>;

type Props<T extends KeyedItem> = Readonly<{
  items: readonly T[];
  columns: number;
  renderItem: ListRenderItem<T>;
  // Keep filters, selection, route state and business anchors outside this component.
  extraData?: unknown;
}>;

export function ResponsiveFlatList<T extends KeyedItem>({
  items,
  columns,
  renderItem,
  extraData,
}: Props<T>) {
  const listRef = useRef<FlatList<T>>(null);
  // Business anchor: the first visible item's id, not a pixel offset.
  const anchorId = useRef<string | null>(null);

  const listExtraData = useMemo(
    () => ({ columns, extraData }),
    [columns, extraData],
  );
  // Fixed per-column width, so a short last row does not stretch its items.
  const cellStyle = useMemo(() => ({ width: `${100 / columns}%` as const }), [columns]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems.find((token) => token.isViewable);
      if (first?.item) anchorId.current = (first.item as T).id;
    },
  ).current;

  // The presentation key remounts only this list; restore the anchor afterwards.
  // FlatList scroll indexes address rows when numColumns > 1; verify on the locked RNOH version.
  useEffect(() => {
    const id = anchorId.current;
    if (!id) return;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const row = Math.floor(index / columns);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: row, animated: false });
    });
    // Restore only when the column count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
    },
    [],
  );

  const renderCell = useCallback<ListRenderItem<T>>(
    (info) => <View style={[styles.cell, cellStyle]}>{renderItem(info)}</View>,
    [cellStyle, renderItem],
  );

  return (
    <FlatList
      ref={listRef}
      key={`presentation-columns-${columns}`}
      contentContainerStyle={styles.content}
      data={items}
      extraData={listExtraData}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      onScrollToIndexFailed={onScrollToIndexFailed}
      onViewableItemsChanged={onViewableItemsChanged}
      renderItem={renderCell}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  // Put gutters inside renderItem (padding) so column widths stay exact.
  cell: {
    minWidth: 0,
  },
});
