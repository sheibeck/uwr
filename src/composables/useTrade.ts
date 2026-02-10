import { computed, type Ref } from 'vue';
import { reducers, type CharacterRow, type ItemInstanceRow, type ItemTemplateRow, type TradeSessionRow, type TradeItemRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseTradeArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  itemInstances: Ref<ItemInstanceRow[]>;
  itemTemplates: Ref<ItemTemplateRow[]>;
  tradeSessions: Ref<TradeSessionRow[]>;
  tradeItems: Ref<TradeItemRow[]>;
};

export const useTrade = ({
  connActive,
  selectedCharacter,
  itemInstances,
  itemTemplates,
  tradeSessions,
  tradeItems,
}: UseTradeArgs) => {
  const startTradeReducer = useReducer(reducers.startTrade);
  const addItemReducer = useReducer(reducers.addTradeItem);
  const removeItemReducer = useReducer(reducers.removeTradeItem);
  const offerReducer = useReducer(reducers.offerTrade);
  const cancelReducer = useReducer(reducers.cancelTrade);

  const activeTrade = computed(() => {
    if (!selectedCharacter.value) return null;
    return (
      tradeSessions.value.find(
        (row) =>
          row.state === 'open' &&
          (row.fromCharacterId === selectedCharacter.value?.id ||
            row.toCharacterId === selectedCharacter.value?.id)
      ) ?? null
    );
  });

  const otherCharacterId = computed(() => {
    if (!activeTrade.value || !selectedCharacter.value) return null;
    return activeTrade.value.fromCharacterId === selectedCharacter.value.id
      ? activeTrade.value.toCharacterId
      : activeTrade.value.fromCharacterId;
  });

  const myItems = computed(() => {
    if (!selectedCharacter.value) return [];
    return itemInstances.value
      .filter((row) => row.ownerCharacterId === selectedCharacter.value?.id && !row.equippedSlot)
      .map((row) => mapItem(row));
  });

  const mapItem = (instance: ItemInstanceRow) => {
    const template = itemTemplates.value.find(
      (row) => row.id.toString() === instance.templateId.toString()
    );
    return {
      id: instance.id,
      name: template?.name ?? 'Unknown',
      rarity: template?.rarity ?? 'Common',
      quantity: instance.quantity ?? 1n,
      stackable: template?.stackable ?? false,
    };
  };

  const myOffer = computed(() => {
    if (!activeTrade.value || !selectedCharacter.value) return [];
    return tradeItems.value
      .filter(
        (row) =>
          row.tradeId === activeTrade.value?.id &&
          row.fromCharacterId === selectedCharacter.value?.id
      )
      .map((row) => {
        const instance = itemInstances.value.find(
          (inst) => inst.id.toString() === row.itemInstanceId.toString()
        );
        if (!instance) return null;
        return {
          id: row.itemInstanceId,
          quantity: row.quantity,
          item: mapItem(instance),
        };
      })
      .filter((row): row is { id: bigint; quantity: bigint; item: ReturnType<typeof mapItem> } =>
        Boolean(row)
      );
  });

  const otherOffer = computed(() => {
    if (!activeTrade.value || !otherCharacterId.value) return [];
    return tradeItems.value
      .filter(
        (row) =>
          row.tradeId === activeTrade.value?.id &&
          row.fromCharacterId === otherCharacterId.value
      )
      .map((row) => {
        const instance = itemInstances.value.find(
          (inst) => inst.id.toString() === row.itemInstanceId.toString()
        );
        if (!instance) return null;
        return {
          id: row.itemInstanceId,
          quantity: row.quantity,
          item: mapItem(instance),
        };
      })
      .filter((row): row is { id: bigint; quantity: bigint; item: ReturnType<typeof mapItem> } =>
        Boolean(row)
      );
  });

  const myOfferLocked = computed(() => {
    if (!activeTrade.value || !selectedCharacter.value) return false;
    return activeTrade.value.fromCharacterId === selectedCharacter.value.id
      ? activeTrade.value.fromAccepted
      : activeTrade.value.toAccepted;
  });

  const otherOfferLocked = computed(() => {
    if (!activeTrade.value || !selectedCharacter.value) return false;
    return activeTrade.value.fromCharacterId === selectedCharacter.value.id
      ? activeTrade.value.toAccepted
      : activeTrade.value.fromAccepted;
  });

  const startTrade = (targetName: string) => {
    if (!connActive.value || !selectedCharacter.value) return;
    startTradeReducer({ characterId: selectedCharacter.value.id, targetName });
  };

  const addItem = (itemInstanceId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    addItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
  };

  const removeItem = (itemInstanceId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    removeItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
  };

  const offerTrade = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    offerReducer({ characterId: selectedCharacter.value.id });
  };

  const cancelTrade = () => {
    if (!connActive.value || !selectedCharacter.value) return;
    cancelReducer({ characterId: selectedCharacter.value.id });
  };

  return {
    activeTrade,
    otherCharacterId,
    myItems,
    myOffer,
    otherOffer,
    myOfferLocked,
    otherOfferLocked,
    startTrade,
    addItem,
    removeItem,
    offerTrade,
    cancelTrade,
  };
};
