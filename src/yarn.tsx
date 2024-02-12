import { createRoot } from "react-dom/client";
import IndexPage from ".";

const elm = document.createElement("div");
document.body.append(elm);
const root = createRoot(elm);
root.render(<IndexPage />);
