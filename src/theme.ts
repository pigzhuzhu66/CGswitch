import type { GlobalThemeOverrides } from "naive-ui";

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#007aff",
    primaryColorHover: "#0071e3",
    primaryColorPressed: "#006edb",
    primaryColorSuppl: "#007aff",
    successColor: "#34c759",
    warningColor: "#ff9f0a",
    errorColor: "#ff3b30",
    errorColorHover: "#d92c24",
    errorColorPressed: "#c4251d",
    errorColorSuppl: "#ff3b30",
    infoColor: "#007aff",
    borderRadius: "10px",
    borderRadiusSmall: "8px",
    fontSizeMedium: "14px",
  },
  Card: {
    borderRadius: "14px",
  },
  Button: {
    fontWeight: "600",
  },
};
