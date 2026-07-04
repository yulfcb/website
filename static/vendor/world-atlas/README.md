# World Atlas 资料来源 (中国 ECS 服务器内 curl 下到本地)

| File | Source | Size | License |
|------|--------|------|---------|
| `countries-110m.json` | jsdelivr.net/npm/world-atlas@2 | 107 KB | Public Domain (Natural Earth) + ISC (TopoJSON) |
| `countries-50m.json` | jsdelivr.net/npm/world-atlas@2 | 756 KB | Public Domain (Natural Earth) + ISC (TopoJSON) |
| `topojson-client.min.js` | jsdelivr.net/npm/topojson-client@3 | 7 KB | ISC |
| `d3-geo.min.js` | jsdelivr.net/npm/d3-geo@3 | 36 KB | ISC |

## 数据来源链路
1. Natural Earth (公开域数据，~200 国家边界)
   → TopoJSON-client 打包
   → world-atlas npm package (Mike Bostock)
   → jsdelivr CDN

## 国内 ECS 获取
直接 curl commons.wikimedia.org / wikipedia / openstreetmap 都被 GFW 屏蔽.
jsdelivr.net 国内可访问, 走它下. server 一次性 curl 后落地 vendor.
之后浏览器从 /static/vendor 拉 (符合 "CDN 不能在线拉数据" hard rule).

## 许可
- Natural Earth: Public Domain (CC0)
- world-atlas TopoJSON: ISC
- topojson-client: ISC
- d3-geo: ISC

均允许商业使用、无需署名.
