import { LiveHadledValueType } from "#/types/LiveHadledValue.type"
import { ValkeyItemType } from "./ValkeyItem.type"

export type ValkeyItemWithHandledValueType = {
    liveData: ValkeyItemType,
    value: LiveHadledValueType

}