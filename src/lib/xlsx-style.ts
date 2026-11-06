import * as XLSXNamespace from "xlsx-js-style";

const namespaceWithDefault = XLSXNamespace as unknown as {
  default?: typeof XLSXNamespace;
};

const XLSXStyle = namespaceWithDefault.default ?? XLSXNamespace;

export default XLSXStyle;
