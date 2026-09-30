import { LocationPathDataType } from "#/types/LocationPathData.type";
import { LocationBindsItemType } from "#modules/postgres/types/LocationBindsItem.type";

export function getLocationPath(
    locationId: number | undefined,
    locations: LocationBindsItemType[],
    path: number[] = [],
    pathName: string[] = []
): LocationPathDataType {
    const location = locations.find(loc => loc.id === locationId);

    if (!location) {
        return { path, pathName }; // Прекратить, если location не найден
    }

    const newPathName = [location.name, ...pathName]
    const newPath = [location.id, ...path]; // Добавить текущую location в начало

    if (location.location_id) {
        return getLocationPath(location.location_id, locations, newPath, newPathName);
    } else {
        return { path: newPath, pathName: newPathName, site_name: location.site_name }; // Достигнут корень
    }
}