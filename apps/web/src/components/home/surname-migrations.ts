import type { SurnameData } from '@/types/home'

/**
 * 首页姓氏迁徙。目标读者是海外华侨，所以海图重心在华南海岸到南洋。
 *
 * 地图内按侨乡分航路，不汇成一条新加坡绳子：
 * - 闽南（泉州、厦门）：台湾、马尼拉、宿务、新加坡、雅加达、泗水
 * - 潮汕（汕头）：曼谷、金边、西贡
 * - 广府客家（广州、香港、梅州）：槟城、马六甲、棉兰、仰光
 * - 东亚近海（福州）：长崎、神户、横滨
 *
 * 美洲、澳新、欧洲在这张图外面。航线从香港或马六甲继续往外走，
 * 出框后只在边缘标方向。国内的关东、河西、川滇留着，当作树根。
 * 折点按路程插值，单段跨度控制在约 8 个经纬单位以内。
 */

export interface LngLat {
  lng: number
  lat: number
}

export interface MigrationHub {
  name: string
  lng: number
  lat: number
  desc: string
}

/** 镜头压到华南海岸。关东和西域退到画面上方，南洋港口落在首屏里。 */
export const MIGRATION_MAP_VIEW = {
  center: [24, 114] as [number, number],
  zoom: 4,
}

const W = {
  longxi: { lng: 104.64, lat: 34.98 },
  taiyuan: { lng: 112.55, lat: 37.87 },
  qinghe: { lng: 115.67, lat: 37.07 },
  pengcheng: { lng: 117.2, lat: 34.26 },
  yingchuan: { lng: 113.85, lat: 34.03 },
  hongnong: { lng: 110.87, lat: 34.52 },
  tianshui: { lng: 105.72, lat: 34.58 },
  jiangxia: { lng: 114.31, lat: 30.55 },
  runan: { lng: 114.63, lat: 32.97 },
  wujun: { lng: 120.62, lat: 31.32 },

  changan: { lng: 108.94, lat: 34.27 },
  luoyang: { lng: 112.45, lat: 34.62 },
  kaifeng: { lng: 114.35, lat: 34.8 },
  nanyang: { lng: 112.53, lat: 33.0 },
  zhengzhou: { lng: 113.65, lat: 34.76 },
  beijing: { lng: 116.41, lat: 39.9 },
  shijiazhuang: { lng: 114.51, lat: 38.04 },
  shanhaiguan: { lng: 119.76, lat: 40.0 },
  shenyang: { lng: 123.43, lat: 41.8 },
  changchun: { lng: 125.32, lat: 43.88 },
  harbin: { lng: 126.53, lat: 45.8 },
  jinan: { lng: 117.0, lat: 36.67 },
  tianjin: { lng: 117.2, lat: 39.13 },
  hohhot: { lng: 111.75, lat: 40.84 },

  lanzhou: { lng: 103.83, lat: 36.06 },
  wuwei: { lng: 102.64, lat: 37.93 },
  jiuquan: { lng: 98.49, lat: 39.73 },
  dunhuang: { lng: 94.66, lat: 40.14 },
  hami: { lng: 93.51, lat: 42.83 },
  urumqi: { lng: 87.62, lat: 43.83 },

  hanzhong: { lng: 107.02, lat: 33.07 },
  chengdu: { lng: 104.07, lat: 30.67 },
  chongqing: { lng: 106.55, lat: 29.56 },
  yichang: { lng: 111.29, lat: 30.69 },
  guiyang: { lng: 106.63, lat: 26.65 },
  kunming: { lng: 102.71, lat: 25.04 },
  dali: { lng: 100.23, lat: 25.59 },
  mengzi: { lng: 103.36, lat: 23.37 },
  mandalay: { lng: 96.09, lat: 21.97 },

  wuhan: { lng: 114.3, lat: 30.59 },
  changsha: { lng: 112.94, lat: 28.23 },
  nanchang: { lng: 115.86, lat: 28.68 },
  ganzhou: { lng: 114.93, lat: 25.83 },
  nanxiong: { lng: 114.31, lat: 25.12 },
  meizhou: { lng: 116.12, lat: 24.29 },
  guilin: { lng: 110.28, lat: 25.27 },
  gushi: { lng: 115.65, lat: 32.18 },
  ninghua: { lng: 116.65, lat: 26.26 },
  shaowu: { lng: 117.49, lat: 27.34 },
  hefei: { lng: 117.23, lat: 31.82 },
  nanjing: { lng: 118.78, lat: 32.06 },
  yangzhou: { lng: 119.42, lat: 32.39 },
  hangzhou: { lng: 120.16, lat: 30.25 },
  wenzhou: { lng: 120.7, lat: 28.0 },

  fuzhou: { lng: 119.3, lat: 26.08 },
  putian: { lng: 119.01, lat: 25.43 },
  quanzhou: { lng: 118.59, lat: 24.91 },
  zhangzhou: { lng: 117.65, lat: 24.51 },
  xiamen: { lng: 118.09, lat: 24.48 },
  chaozhou: { lng: 116.63, lat: 23.66 },
  guangzhou: { lng: 113.26, lat: 23.13 },
  nanning: { lng: 108.37, lat: 22.82 },
  haikou: { lng: 110.32, lat: 20.04 },
  penghu: { lng: 119.57, lat: 23.57 },

  tainan: { lng: 120.2, lat: 23.0 },
  kaohsiung: { lng: 120.3, lat: 22.62 },
  lukang: { lng: 120.43, lat: 24.06 },
  taichung: { lng: 120.67, lat: 24.15 },
  hsinchu: { lng: 120.97, lat: 24.8 },
  keelun: { lng: 121.74, lat: 25.13 },

  hanoi: { lng: 105.85, lat: 21.03 },
  hue: { lng: 107.58, lat: 16.46 },
  hoian: { lng: 108.33, lat: 15.88 },
  saigon: { lng: 106.7, lat: 10.78 },
  phnompenh: { lng: 104.93, lat: 11.56 },
  bangkok: { lng: 100.5, lat: 13.75 },
  camau: { lng: 104.75, lat: 8.7 },
  scsSouth: { lng: 104.35, lat: 4.85 },
  singapore: { lng: 103.85, lat: 1.29 },
  malacca: { lng: 102.25, lat: 2.19 },
  scs: { lng: 119.4, lat: 19.7 },
  manila: { lng: 120.98, lat: 14.6 },
  cebu: { lng: 123.89, lat: 10.31 },
  bangka: { lng: 106.1, lat: -2.1 },
  jakarta: { lng: 106.85, lat: -6.17 },
  surabaya: { lng: 112.75, lat: -7.25 },
  shantou: { lng: 116.68, lat: 23.35 },
  hk: { lng: 114.17, lat: 22.32 },
  penang: { lng: 100.34, lat: 5.42 },
  kl: { lng: 101.69, lat: 3.15 },
  medan: { lng: 98.68, lat: 3.59 },
  yangon: { lng: 96.17, lat: 16.87 },
  nagasaki: { lng: 129.88, lat: 32.75 },
  kobe: { lng: 135.19, lat: 34.69 },
  yokohama: { lng: 139.65, lat: 35.45 },
  ecs1: { lng: 123.5, lat: 28.0 },
  ecs2: { lng: 127.0, lat: 30.6 },
  java1: { lng: 106.4, lat: -0.4 },
  java2: { lng: 109.2, lat: -2.6 },
  java3: { lng: 111.6, lat: -4.8 },
  sumatra: { lng: 101.2, lat: 2.4 },
} as const

const route = (...points: LngLat[]): LngLat[] => points.map((p) => ({ lng: p.lng, lat: p.lat }))

export interface OceanExit {
  id: 'americas' | 'oceania' | 'europe'
  label: string
  target: LngLat
  /** 总览时只画这一姓的出框线，避免同一条海路叠成实心带子 */
  carrier: string
}

/** 终点落在常见屏幕之外，画面边缘只留方向名 */
export const OCEAN_EXITS: OceanExit[] = [
  { id: 'americas', label: '北美', target: { lng: 205, lat: 38.2 }, carrier: '李' },
  { id: 'oceania', label: '澳新', target: { lng: 157.2, lat: -25.2 }, carrier: '李' },
  { id: 'europe', label: '欧洲', target: { lng: 24.2, lat: 21.6 }, carrier: '赵' },
]

const toAmericas: LngLat[] = [
  { lng: 121.2, lat: 23.2 },
  { lng: 128.2, lat: 25.2 },
  { lng: 135.2, lat: 27.2 },
  { lng: 142.2, lat: 29.2 },
  { lng: 149.2, lat: 31.0 },
  { lng: 156.2, lat: 32.6 },
  { lng: 163.2, lat: 34.0 },
  { lng: 170.2, lat: 35.2 },
  { lng: 177.2, lat: 36.2 },
  { lng: 184.2, lat: 37.0 },
  { lng: 191.2, lat: 37.6 },
  { lng: 198.2, lat: 38.0 },
  OCEAN_EXITS[0].target,
]

const toOceania: LngLat[] = [
  { lng: 117.6, lat: 18.2 },
  { lng: 121.2, lat: 14.2 },
  { lng: 124.8, lat: 10.2 },
  { lng: 128.4, lat: 6.2 },
  { lng: 132.0, lat: 2.2 },
  { lng: 135.6, lat: -1.8 },
  { lng: 139.2, lat: -5.8 },
  { lng: 142.8, lat: -9.8 },
  { lng: 146.4, lat: -13.8 },
  { lng: 150.0, lat: -17.8 },
  { lng: 153.6, lat: -21.8 },
  OCEAN_EXITS[1].target,
]

const toEurope: LngLat[] = [
  { lng: 96.2, lat: 3.6 },
  { lng: 90.2, lat: 5.0 },
  { lng: 84.2, lat: 6.2 },
  { lng: 78.2, lat: 7.2 },
  { lng: 72.2, lat: 8.2 },
  { lng: 66.2, lat: 9.4 },
  { lng: 60.2, lat: 10.8 },
  { lng: 54.2, lat: 12.2 },
  { lng: 48.2, lat: 13.8 },
  { lng: 42.2, lat: 15.4 },
  { lng: 36.2, lat: 17.2 },
  { lng: 30.2, lat: 19.2 },
  OCEAN_EXITS[2].target,
]

export const surnames: SurnameData[] = [
  {
    name: '李',
    color: '#C9A96E',
    origin: { ...W.longxi },
    labelOffset: { x: -14, y: -14 },
    description: '发源于陇西（今甘肃东南部）',
    paths: [
      route(W.longxi, W.lanzhou, W.wuwei, W.jiuquan, W.hami, W.urumqi),
      route(W.longxi, W.changan, W.luoyang, W.kaifeng, W.jinan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.longxi, W.hanzhong, W.chengdu, W.kunming),
      route(W.longxi, W.changan, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore),
      route(W.longxi, W.changan, W.nanyang, W.wuhan, W.changsha, W.ganzhou, W.meizhou, W.chaozhou, W.shantou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh, W.bangkok),
      route(W.longxi, W.changan, W.nanyang, W.wuhan, W.changsha, W.guilin, W.nanning, W.hanoi, W.hue, W.hoian, W.saigon),
      route(W.longxi, W.changan, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toAmericas),
      route(W.longxi, W.changan, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toOceania),
    ],
  },
  {
    name: '王',
    color: '#E8A87C',
    origin: { ...W.taiyuan },
    description: '发源于太原（今山西中部）',
    paths: [
      route(W.taiyuan, W.shijiazhuang, W.beijing, W.shanhaiguan, W.shenyang, W.changchun, W.harbin),
      route(W.taiyuan, W.changan, W.lanzhou, W.wuwei, W.jiuquan, W.dunhuang),
      route(W.taiyuan, W.changan, W.hanzhong, W.chengdu, W.kunming),
      route(W.taiyuan, W.luoyang, W.gushi, W.ninghua, W.fuzhou, W.keelun),
      route(W.taiyuan, W.luoyang, W.gushi, W.ninghua, W.fuzhou, W.quanzhou, W.xiamen, W.scs, W.manila),
      route(W.taiyuan, W.luoyang, W.gushi, W.ninghua, W.fuzhou, W.quanzhou, W.xiamen, W.chaozhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore),
      route(W.taiyuan, W.luoyang, W.gushi, W.ninghua, W.fuzhou, W.ecs1, W.ecs2, W.nagasaki, W.kobe, W.yokohama),
      route(W.taiyuan, W.luoyang, W.kaifeng, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toAmericas),
    ],
  },
  {
    name: '张',
    color: '#85C1A9',
    origin: { ...W.qinghe },
    description: '发源于清河（今河北南部）',
    paths: [
      route(W.qinghe, W.jinan, W.tianjin, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.qinghe, W.taiyuan, W.changan, W.lanzhou, W.wuwei, W.jiuquan, W.dunhuang),
      route(W.qinghe, W.taiyuan, W.changan, W.hanzhong, W.chengdu, W.kunming),
      route(W.qinghe, W.kaifeng, W.wuhan, W.changsha, W.guilin, W.nanning, W.hanoi, W.hue, W.hoian, W.saigon, W.phnompenh, W.bangkok),
      route(W.qinghe, W.kaifeng, W.wuhan, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore),
      route(W.qinghe, W.kaifeng, W.wuhan, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.sumatra, W.medan),
      route(W.qinghe, W.kaifeng, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toAmericas),
      route(W.qinghe, W.kaifeng, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toOceania),
    ],
  },
  {
    name: '刘',
    color: '#7FB3D8',
    origin: { ...W.pengcheng },
    description: '发源于彭城（今江苏徐州）',
    paths: [
      route(W.pengcheng, W.jinan, W.tianjin, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.pengcheng, W.kaifeng, W.luoyang, W.changan, W.lanzhou, W.wuwei, W.jiuquan),
      route(W.pengcheng, W.hefei, W.wuhan, W.yichang, W.chongqing, W.chengdu, W.kunming),
      route(W.pengcheng, W.nanjing, W.nanchang, W.ganzhou, W.meizhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.malacca),
      route(W.pengcheng, W.nanjing, W.nanchang, W.ganzhou, W.meizhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon),
      route(W.pengcheng, W.nanjing, W.nanchang, W.ganzhou, W.meizhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh),
      route(W.pengcheng, W.nanjing, W.nanchang, W.ganzhou, W.guangzhou, W.hk, ...toAmericas),
    ],
  },
  {
    name: '陈',
    color: '#F0B27A',
    origin: { ...W.yingchuan },
    labelOffset: { x: -16, y: -12 },
    description: '发源于颍川（今河南许昌）',
    paths: [
      route(W.yingchuan, W.kaifeng, W.jinan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.yingchuan, W.luoyang, W.changan, W.lanzhou, W.wuwei, W.jiuquan),
      route(W.yingchuan, W.nanyang, W.yichang, W.chongqing, W.chengdu, W.kunming),
      route(W.yingchuan, W.gushi, W.ninghua, W.zhangzhou, W.penghu, W.tainan),
      route(W.yingchuan, W.gushi, W.ninghua, W.quanzhou, W.xiamen, W.scs, W.manila),
      route(W.yingchuan, W.gushi, W.ninghua, W.quanzhou, W.xiamen, W.scs, W.manila, W.cebu),
      route(W.yingchuan, W.gushi, W.ninghua, W.xiamen, W.chaozhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.bangka, W.jakarta),
      route(W.yingchuan, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toAmericas),
    ],
  },
  {
    name: '杨',
    color: '#A3D4C4',
    origin: { ...W.hongnong },
    description: '发源于弘农（今河南灵宝）',
    paths: [
      route(W.hongnong, W.luoyang, W.kaifeng, W.jinan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.hongnong, W.changan, W.lanzhou, W.wuwei, W.jiuquan, W.dunhuang),
      route(W.hongnong, W.changan, W.hanzhong, W.chengdu, W.kunming),
      route(W.hongnong, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh, W.bangkok, W.yangon),
      route(W.hongnong, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh, W.bangkok),
      route(W.hongnong, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore),
      route(W.hongnong, W.nanyang, W.wuhan, W.changsha, W.guangzhou, W.hk, ...toOceania),
    ],
  },
  {
    name: '赵',
    color: '#D7A9E4',
    origin: { ...W.tianshui },
    labelOffset: { x: 14, y: 22 },
    description: '发源于天水（今甘肃天水）',
    paths: [
      route(W.tianshui, W.changan, W.taiyuan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.tianshui, W.lanzhou, W.wuwei, W.jiuquan, W.dunhuang, W.hami),
      route(W.tianshui, W.hanzhong, W.chengdu, W.kunming),
      route(W.tianshui, W.hanzhong, W.chongqing, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon),
      route(W.tianshui, W.hanzhong, W.chongqing, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh, W.bangkok),
      route(W.tianshui, W.hanzhong, W.chongqing, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh),
      route(W.tianshui, W.hanzhong, W.chongqing, W.changsha, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.malacca, ...toEurope),
    ],
  },
  {
    name: '黄',
    color: '#F5CBA7',
    origin: { ...W.jiangxia },
    description: '发源于江夏（今湖北武汉）',
    paths: [
      route(W.jiangxia, W.kaifeng, W.jinan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.jiangxia, W.nanyang, W.changan, W.lanzhou, W.wuwei, W.jiuquan),
      route(W.jiangxia, W.yichang, W.chongqing, W.chengdu, W.kunming),
      route(W.jiangxia, W.nanchang, W.ganzhou, W.meizhou, W.chaozhou, W.xiamen, W.scs, W.manila),
      route(W.jiangxia, W.changsha, W.nanxiong, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.kl, W.penang),
      route(W.jiangxia, W.changsha, W.nanxiong, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.java1, W.java2, W.java3, W.surabaya),
      route(W.jiangxia, W.changsha, W.nanxiong, W.guangzhou, W.hk, ...toAmericas),
    ],
  },
  {
    name: '周',
    color: '#A9CCE3',
    origin: { ...W.runan },
    labelOffset: { x: 18, y: 22 },
    description: '发源于汝南（今河南平舆）',
    paths: [
      route(W.runan, W.kaifeng, W.jinan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.runan, W.luoyang, W.changan, W.lanzhou, W.wuwei, W.jiuquan),
      route(W.runan, W.nanyang, W.yichang, W.chongqing, W.chengdu, W.kunming),
      route(W.runan, W.wuhan, W.changsha, W.guilin, W.nanning, W.hanoi, W.hue, W.hoian, W.saigon),
      route(W.runan, W.wuhan, W.changsha, W.guilin, W.nanning, W.hanoi, W.hue, W.hoian, W.saigon, W.phnompenh),
      route(W.runan, W.wuhan, W.changsha, W.guilin, W.nanning, W.hanoi, W.hue, W.hoian, W.saigon, W.phnompenh, W.bangkok),
      route(W.runan, W.wuhan, W.changsha, W.guilin, W.nanning, W.hanoi, W.hue, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.malacca, ...toEurope),
    ],
  },
  {
    name: '吴',
    color: '#82E0AA',
    origin: { ...W.wujun },
    description: '发源于吴郡（今江苏苏州）',
    paths: [
      route(W.wujun, W.yangzhou, W.pengcheng, W.jinan, W.beijing, W.shanhaiguan, W.shenyang, W.changchun),
      route(W.wujun, W.yangzhou, W.pengcheng, W.kaifeng, W.luoyang, W.changan, W.lanzhou, W.wuwei, W.jiuquan),
      route(W.wujun, W.nanjing, W.wuhan, W.yichang, W.chongqing, W.chengdu, W.kunming),
      route(W.wujun, W.hangzhou, W.wenzhou, W.fuzhou, W.quanzhou, W.penghu, W.tainan),
      route(W.wujun, W.hangzhou, W.fuzhou, W.chaozhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore),
      route(W.wujun, W.hangzhou, W.fuzhou, W.chaozhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.camau, W.scsSouth, W.singapore, W.bangka, W.jakarta),
      route(W.wujun, W.hangzhou, W.fuzhou, W.chaozhou, W.guangzhou, W.hk, W.haikou, W.hoian, W.saigon, W.phnompenh, W.bangkok, W.yangon),
      route(W.wujun, W.hangzhou, W.fuzhou, W.chaozhou, W.guangzhou, W.hk, ...toAmericas),
    ],
  },
]

export const migrationHubs: MigrationHub[] = [
  { name: '泉州', lng: 118.59, lat: 24.91, desc: '闽南出海港' },
  { name: '汕头', lng: 116.68, lat: 23.35, desc: '潮汕出海港' },
  { name: '香港', lng: 114.17, lat: 22.32, desc: '远洋中转' },
  { name: '台湾', lng: 120.45, lat: 23.7, desc: '渡台登岸' },
  { name: '横滨', lng: 139.65, lat: 35.45, desc: '日本华侨口岸' },
  { name: '马尼拉', lng: 120.98, lat: 14.6, desc: '吕宋' },
  { name: '宿务', lng: 123.89, lat: 10.31, desc: '米沙鄢' },
  { name: '西贡', lng: 106.7, lat: 10.78, desc: '南圻' },
  { name: '金边', lng: 104.93, lat: 11.56, desc: '柬埔寨' },
  { name: '曼谷', lng: 100.5, lat: 13.75, desc: '暹罗' },
  { name: '仰光', lng: 96.17, lat: 16.87, desc: '缅甸' },
  { name: '新加坡', lng: 103.85, lat: 1.29, desc: '南洋汇聚港' },
  { name: '槟城', lng: 100.34, lat: 5.42, desc: '马来亚北岸' },
  { name: '棉兰', lng: 98.68, lat: 3.59, desc: '苏门答腊' },
  { name: '雅加达', lng: 106.85, lat: -6.17, desc: '爪哇' },
  { name: '泗水', lng: 112.75, lat: -7.25, desc: '东爪哇' },
]

/** 经纬跨度。纬度略加权，避免南北向长跳被当成短距离。 */
export function segmentSpan(a: LngLat, b: LngLat): number {
  const dLng = b.lng - a.lng
  const dLat = (b.lat - a.lat) * 1.15
  return Math.hypot(dLng, dLat)
}

export function pathLength(path: LngLat[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += segmentSpan(path[i - 1], path[i])
  return total
}

export function maxSegmentSpan(path: LngLat[]): number {
  let max = 0
  for (let i = 1; i < path.length; i++) max = Math.max(max, segmentSpan(path[i - 1], path[i]))
  return max
}

/** 按路程比例取点，长海段和短陆段花的时间与距离成正比。 */
export function pathPointAt(path: LngLat[], progress: number): LngLat {
  if (path.length === 0) return { lng: 0, lat: 0 }
  if (path.length === 1 || progress <= 0) return path[0]
  if (progress >= 1) return path[path.length - 1]
  const total = pathLength(path)
  let remain = progress * total
  for (let i = 1; i < path.length; i++) {
    const span = segmentSpan(path[i - 1], path[i])
    if (remain <= span || i === path.length - 1) {
      const t = span === 0 ? 0 : Math.min(1, remain / span)
      return {
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t,
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t,
      }
    }
    remain -= span
  }
  return path[path.length - 1]
}

export function sameLngLat(a: LngLat, b: LngLat, eps = 0.08): boolean {
  return Math.abs(a.lng - b.lng) <= eps && Math.abs(a.lat - b.lat) <= eps
}

export function oceanExitOf(path: LngLat[]): OceanExit | undefined {
  const end = path[path.length - 1]
  if (!end) return undefined
  return OCEAN_EXITS.find((exit) => sameLngLat(end, exit.target))
}
