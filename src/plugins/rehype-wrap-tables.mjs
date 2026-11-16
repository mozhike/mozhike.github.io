import { visit } from "unist-util-visit";

/**
 * 把 markdown 里的 <table> 包进 <div class="table-wrap">，
 * 让长表格可以横向滚动，而不是把文章布局撑破。
 */
export function rehypeWrapTables() {
	return (tree) => {
		visit(tree, "element", (node, index, parent) => {
			if (node.tagName !== "table") return;
			if (!parent || index === null || index === undefined) return;
			if (
				parent.tagName === "div" &&
				Array.isArray(parent.properties?.className) &&
				parent.properties.className.includes("table-wrap")
			) {
				return;
			}

			parent.children[index] = {
				type: "element",
				tagName: "div",
				properties: { className: ["table-wrap"] },
				children: [node],
			};

			return "skip";
		});
	};
}
