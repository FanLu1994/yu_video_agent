import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "zh-CN",
  resources: {
    "zh-CN": {
      translation: {
        appName: "视频 Agent",
        titleHomePage: "首页",
        titleSecondPage: "第二页",
        documentation: "文档",
        madeBy: "开发者：LuanRoger",
      },
    },
    en: {
      translation: {
        appName: "Video Agent",
        titleHomePage: "Home",
        titleSecondPage: "Second Page",
        documentation: "Documentation",
        madeBy: "Made by LuanRoger",
      },
    },
    "pt-BR": {
      translation: {
        appName: "electron-shadcn",
        titleHomePage: "Página Inicial",
        titleSecondPage: "Segunda Página",
        documentation: "Documentação",
        madeBy: "Feito por LuanRoger",
      },
    },
  },
});
