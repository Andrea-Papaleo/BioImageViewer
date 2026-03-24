import { appSlice } from "@/state/appSlice";
import { selectActivePlaneIdx, selectPlanes } from "@/state/selectors";
import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

export const SliceAdjustor = () => {
  const dispatch = useDispatch();
  const activePlane = useSelector(selectActivePlaneIdx);
  const planes = useSelector(selectPlanes);
  const maxPlanes = useMemo(() => Object.keys(planes).length, [planes]);

  const handleSliderChange = (
    event: React.ChangeEvent<HTMLInputElement, HTMLInputElement>,
  ) => {
    const index = +event.currentTarget.value;
    dispatch(appSlice.actions.setActivePlaneId(index));
  };

  return (
    <div className="w-full flex flex-col items-center border-t border-slate-700 py-2 gap-2">
      <h3 className="text-md font-bold">Z-slices</h3>
      <div className="w-8/10 pb-2">
        {activePlane && (
          <input
            type="range"
            min={0}
            max={maxPlanes}
            value={activePlane}
            step={1}
            onChange={handleSliderChange}
            className="w-full"
          />
        )}
      </div>
    </div>
  );
};
