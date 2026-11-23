export interface ModuleGroup {
	key: string;
	name: string;
	blurb: string;
	matches: (category: string | null | undefined) => boolean;
}

export interface BlogModule {
	key: string;
	name: string;
	short: string;
	path: string;
	color: string;
	blurb: string;
	chips: string[];
	matches: (category: string | null | undefined) => boolean;
	groups?: ModuleGroup[];
}

export const MODULES: BlogModule[] = [
	{
		key: "market",
		name: "股市研究",
		short: "market",
		path: "/market/",
		color: "var(--module-market)",
		blurb:
			"记录 A 股每天发生了什么、为什么，以及研究框架的进展。只做市场观察与复盘，不展示具体标的、持仓与交易参数，不构成投资建议。",
		chips: ["每日复盘", "盘中直击", "市场宽度", "风格观察", "研究进展"],
		matches: (category) =>
			category === "股市研究" ||
			category === "盘中直击·A股" ||
			category === "盘中直击·美股",
		groups: [
			{
				key: "review",
				name: "每日复盘",
				blurb: "每个交易日收盘后一篇：指数、宽度、量能、行业全量与消息面。",
				matches: (category) => category === "股市研究",
			},
			{
				key: "intraday-a",
				name: "盘中直击 · A股",
				blurb: "极端行情动态跟踪：交易时段每半小时一档，只记盘面事实与价量推断。",
				matches: (category) => category === "盘中直击·A股",
			},
			{
				key: "intraday-us",
				name: "盘中直击 · 美股",
				blurb: "极端行情动态跟踪·美股时段（北京时间晚间）：美债、美股与跨资产核对。",
				matches: (category) => category === "盘中直击·美股",
			},
		],
	},
	{
		key: "lab",
		name: "实战记录",
		short: "lab",
		path: "/lab/",
		color: "var(--module-lab)",
		blurb:
			"把想法变成能跑的东西：AI 工具、量化框架、自动化管线的取舍与踩坑，按时间线留档。",
		chips: ["AI", "量化", "工程", "系统治理"],
		matches: (category) => category === "实战记录",
	},
	{
		key: "system",
		name: "系统介绍",
		short: "system",
		path: "/system/",
		color: "var(--module-system)",
		blurb:
			"这套 A 股监测系统的说明书：它解决什么问题、由哪几层组成、做到了哪一步、还有哪些没做到。",
		chips: ["系统原理", "功能地图", "设想与达成", "边界说明"],
		matches: (category) => category === "系统介绍",
	},
	{
		key: "notes",
		name: "备忘记事",
		short: "notes",
		path: "/notes/",
		color: "var(--module-notes)",
		blurb: "不成体系的技术备忘与站务记录：环境、命令、踩过的坑，留个底防止再踩。",
		chips: ["技术备忘", "站务"],
		matches: (category) => category === "技术备忘" || category === "站务",
	},
];

const FALLBACK_MODULE: BlogModule = {
	key: "misc",
	name: "未分类",
	short: "misc",
	path: "/archive/",
	color: "var(--primary)",
	blurb: "还没归入栏目的文章。",
	chips: [],
	matches: () => false,
};

export function getModuleByCategory(
	category: string | null | undefined,
): BlogModule {
	return MODULES.find((m) => m.matches(category)) ?? FALLBACK_MODULE;
}
