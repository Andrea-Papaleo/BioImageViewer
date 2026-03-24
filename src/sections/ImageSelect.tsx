import { useMemo, type ChangeEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectActiveImageId, selectImages } from "@/state/selectors";
import { appSlice } from "@/state/appSlice";

export const ImageSelect = () => {
  const dispatch = useDispatch();
  const activeImageId = useSelector(selectActiveImageId);
  const images = useSelector(selectImages);
  const imageIds = useMemo(
    () => Object.values(images).map((im) => im.id),
    [images],
  );

  const handleChangeActiveImageId = (event: ChangeEvent<HTMLSelectElement>) => {
    dispatch(appSlice.actions.setActiveImageId(event.currentTarget.value));
  };

  return (
    <div className="flex gap-2">
      <select
        value={activeImageId ?? ""}
        onChange={handleChangeActiveImageId}
        className=" h-8  text-gray-100 flex items-center"
      >
        <option value="" disabled>
          Select an image
        </option>
        {imageIds.map((id) => (
          <option key={id} value={id}>
            {images[id].name}
          </option>
        ))}
      </select>
    </div>
  );
};
