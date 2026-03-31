import { useSelector } from "react-redux";
import type { RootState } from "./store";

// Use throughout your app instead of plain `useDispatch` and `useSelector`

const useAppSelector = useSelector.withTypes<RootState>();

export const useParamSelector = <P, R>(
  selector: (state: RootState, param: P) => R,
  param: P,
) => useAppSelector((state) => selector(state, param));
