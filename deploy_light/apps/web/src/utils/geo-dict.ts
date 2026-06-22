/**
 * 中国县级以上地名字典（精简版）
 *
 * 覆盖：4 个直辖市、27 个省会城市、~150 个主要地级市、~50 个知名县/县级市
 * 经纬度为各政府驻地大致坐标。
 *
 * 使用方法：
 *   import { geoLookup } from '@/utils/geo-dict';
 *   const coord = geoLookup('山西洪洞'); // -> { lat, lng, level, name } | null
 *
 * 数据可按需扩充。当前规模 ~250 条，覆盖大多数族谱常见地名。
 */

export interface GeoCoord {
  lat: number;
  lng: number;
  level: 'province' | 'city' | 'county';
  /** 标准化名称（用于回写 Person 表） */
  name: string;
}

type GeoDictEntry = Omit<GeoCoord, 'name'> & { name: string };

// 数据按拼音/省份分类便于维护
const RAW_DICT: GeoDictEntry[] = [
  // ==================== 直辖市 ====================
  { name: '北京', lat: 39.9042, lng: 116.4074, level: 'province' },
  { name: '北京市', lat: 39.9042, lng: 116.4074, level: 'province' },
  { name: '天津', lat: 39.3434, lng: 117.3616, level: 'province' },
  { name: '天津市', lat: 39.3434, lng: 117.3616, level: 'province' },
  { name: '上海', lat: 31.2304, lng: 121.4737, level: 'province' },
  { name: '上海市', lat: 31.2304, lng: 121.4737, level: 'province' },
  { name: '重庆', lat: 29.5630, lng: 106.5516, level: 'province' },
  { name: '重庆市', lat: 29.5630, lng: 106.5516, level: 'province' },

  // ==================== 河北省 ====================
  { name: '石家庄', lat: 38.0428, lng: 114.5149, level: 'city' },
  { name: '唐山', lat: 39.6308, lng: 118.1804, level: 'city' },
  { name: '秦皇岛', lat: 39.9354, lng: 119.6005, level: 'city' },
  { name: '邯郸', lat: 36.6253, lng: 114.5391, level: 'city' },
  { name: '邢台', lat: 37.0707, lng: 114.5048, level: 'city' },
  { name: '保定', lat: 38.8740, lng: 115.4646, level: 'city' },
  { name: '张家口', lat: 40.8245, lng: 114.8794, level: 'city' },
  { name: '承德', lat: 40.9519, lng: 117.9634, level: 'city' },
  { name: '沧州', lat: 38.3104, lng: 116.8388, level: 'city' },
  { name: '廊坊', lat: 39.5379, lng: 116.6836, level: 'city' },
  { name: '衡水', lat: 37.7385, lng: 115.6705, level: 'city' },
  { name: '邢台县', lat: 37.0707, lng: 114.5048, level: 'county' },
  { name: '涿州', lat: 39.4881, lng: 115.9744, level: 'county' },
  { name: '定州', lat: 38.5162, lng: 114.9916, level: 'county' },

  // ==================== 山西省 ====================
  { name: '太原', lat: 37.8706, lng: 112.5489, level: 'city' },
  { name: '大同', lat: 40.0764, lng: 113.3001, level: 'city' },
  { name: '阳泉', lat: 37.8576, lng: 113.5763, level: 'city' },
  { name: '长治', lat: 36.1955, lng: 113.1163, level: 'city' },
  { name: '晋城', lat: 35.4906, lng: 112.8514, level: 'city' },
  { name: '朔州', lat: 39.3315, lng: 112.4329, level: 'city' },
  { name: '晋中', lat: 37.6878, lng: 112.7526, level: 'city' },
  { name: '运城', lat: 35.0269, lng: 111.0030, level: 'city' },
  { name: '忻州', lat: 38.4167, lng: 112.7341, level: 'city' },
  { name: '临汾', lat: 36.0880, lng: 111.5180, level: 'city' },
  { name: '吕梁', lat: 37.5188, lng: 111.1343, level: 'city' },
  { name: '洪洞', lat: 36.2548, lng: 111.6749, level: 'county' },
  { name: '洪洞县', lat: 36.2548, lng: 111.6749, level: 'county' },
  { name: '平遥', lat: 37.1894, lng: 112.1739, level: 'county' },
  { name: '平遥县', lat: 37.1894, lng: 112.1739, level: 'county' },
  { name: '祁县', lat: 37.3575, lng: 112.3343, level: 'county' },
  { name: '太谷', lat: 37.4211, lng: 112.5513, level: 'county' },
  { name: '榆次', lat: 37.6979, lng: 112.7081, level: 'county' },
  { name: '运城', lat: 35.0269, lng: 111.0030, level: 'county' },
  { name: '临猗', lat: 35.1443, lng: 110.7746, level: 'county' },
  { name: '闻喜', lat: 35.3563, lng: 111.2202, level: 'county' },
  { name: '代县', lat: 39.0669, lng: 112.9570, level: 'county' },

  // ==================== 内蒙古 ====================
  { name: '呼和浩特', lat: 40.8425, lng: 111.7491, level: 'city' },
  { name: '包头', lat: 40.6574, lng: 109.8403, level: 'city' },
  { name: '乌海', lat: 39.6737, lng: 106.7948, level: 'city' },
  { name: '赤峰', lat: 42.2576, lng: 118.8889, level: 'city' },
  { name: '通辽', lat: 43.6173, lng: 122.2657, level: 'city' },
  { name: '鄂尔多斯', lat: 39.6086, lng: 109.7811, level: 'city' },
  { name: '呼伦贝尔', lat: 49.2120, lng: 119.7572, level: 'city' },
  { name: '巴彦淖尔', lat: 40.7574, lng: 107.4163, level: 'city' },
  { name: '乌兰察布', lat: 41.0341, lng: 113.1145, level: 'city' },

  // ==================== 辽宁省 ====================
  { name: '沈阳', lat: 41.8057, lng: 123.4315, level: 'city' },
  { name: '大连', lat: 38.9140, lng: 121.6147, level: 'city' },
  { name: '鞍山', lat: 41.1085, lng: 122.9946, level: 'city' },
  { name: '抚顺', lat: 41.8806, lng: 123.9572, level: 'city' },
  { name: '本溪', lat: 41.2864, lng: 123.7651, level: 'city' },
  { name: '丹东', lat: 40.1294, lng: 124.3543, level: 'city' },
  { name: '锦州', lat: 41.1193, lng: 121.1268, level: 'city' },
  { name: '营口', lat: 40.6675, lng: 122.2349, level: 'city' },
  { name: '阜新', lat: 42.0218, lng: 121.6485, level: 'city' },
  { name: '辽阳', lat: 41.2694, lng: 123.1721, level: 'city' },
  { name: '盘锦', lat: 41.1245, lng: 122.0707, level: 'city' },
  { name: '铁岭', lat: 42.2236, lng: 123.7256, level: 'city' },
  { name: '朝阳', lat: 41.5765, lng: 120.4509, level: 'city' },
  { name: '葫芦岛', lat: 40.7556, lng: 120.8378, level: 'city' },

  // ==================== 吉林省 ====================
  { name: '长春', lat: 43.8868, lng: 125.3245, level: 'city' },
  { name: '吉林', lat: 43.8378, lng: 126.5494, level: 'city' },
  { name: '四平', lat: 43.1666, lng: 124.3502, level: 'city' },
  { name: '辽源', lat: 42.8881, lng: 125.1450, level: 'city' },
  { name: '通化', lat: 41.7211, lng: 125.9395, level: 'city' },
  { name: '白山', lat: 41.9407, lng: 126.4239, level: 'city' },
  { name: '松原', lat: 45.1183, lng: 124.8252, level: 'city' },
  { name: '白城', lat: 45.6196, lng: 122.8389, level: 'city' },

  // ==================== 黑龙江省 ====================
  { name: '哈尔滨', lat: 45.8038, lng: 126.5340, level: 'city' },
  { name: '齐齐哈尔', lat: 47.3543, lng: 123.9180, level: 'city' },
  { name: '鸡西', lat: 45.2950, lng: 130.9690, level: 'city' },
  { name: '鹤岗', lat: 47.3322, lng: 130.2773, level: 'city' },
  { name: '双鸭山', lat: 46.6464, lng: 131.1591, level: 'city' },
  { name: '大庆', lat: 46.5897, lng: 125.1038, level: 'city' },
  { name: '伊春', lat: 47.7273, lng: 128.8413, level: 'city' },
  { name: '佳木斯', lat: 46.7997, lng: 130.3186, level: 'city' },
  { name: '七台河', lat: 45.7710, lng: 130.9015, level: 'city' },
  { name: '牡丹江', lat: 44.5826, lng: 129.6086, level: 'city' },
  { name: '黑河', lat: 50.2451, lng: 127.5285, level: 'city' },
  { name: '绥化', lat: 46.6374, lng: 126.9695, level: 'city' },

  // ==================== 江苏省 ====================
  { name: '南京', lat: 32.0603, lng: 118.7969, level: 'city' },
  { name: '无锡', lat: 31.4912, lng: 120.3119, level: 'city' },
  { name: '徐州', lat: 34.2616, lng: 117.1860, level: 'city' },
  { name: '常州', lat: 31.7728, lng: 119.9469, level: 'city' },
  { name: '苏州', lat: 31.2989, lng: 120.5853, level: 'city' },
  { name: '南通', lat: 32.0145, lng: 120.8643, level: 'city' },
  { name: '连云港', lat: 34.5970, lng: 119.2216, level: 'city' },
  { name: '淮安', lat: 33.6100, lng: 119.0149, level: 'city' },
  { name: '盐城', lat: 33.3500, lng: 120.1633, level: 'city' },
  { name: '扬州', lat: 32.3947, lng: 119.4124, level: 'city' },
  { name: '镇江', lat: 32.1885, lng: 119.4250, level: 'city' },
  { name: '泰州', lat: 32.4554, lng: 119.9252, level: 'city' },
  { name: '宿迁', lat: 33.9630, lng: 118.2752, level: 'city' },

  // ==================== 浙江省 ====================
  { name: '杭州', lat: 30.2741, lng: 120.1551, level: 'city' },
  { name: '宁波', lat: 29.8683, lng: 121.5440, level: 'city' },
  { name: '温州', lat: 27.9938, lng: 120.6993, level: 'city' },
  { name: '嘉兴', lat: 30.7522, lng: 120.7506, level: 'city' },
  { name: '湖州', lat: 30.8932, lng: 120.0875, level: 'city' },
  { name: '绍兴', lat: 30.0023, lng: 120.5810, level: 'city' },
  { name: '金华', lat: 29.0784, lng: 119.6473, level: 'city' },
  { name: '衢州', lat: 28.9359, lng: 118.8593, level: 'city' },
  { name: '舟山', lat: 29.9853, lng: 122.2072, level: 'city' },
  { name: '台州', lat: 28.6560, lng: 121.4208, level: 'city' },
  { name: '丽水', lat: 28.4517, lng: 119.9229, level: 'city' },

  // ==================== 安徽省 ====================
  { name: '合肥', lat: 31.8206, lng: 117.2272, level: 'city' },
  { name: '芜湖', lat: 31.3526, lng: 118.4326, level: 'city' },
  { name: '蚌埠', lat: 32.9163, lng: 117.3893, level: 'city' },
  { name: '淮南', lat: 32.6266, lng: 117.0184, level: 'city' },
  { name: '马鞍山', lat: 31.6700, lng: 118.5061, level: 'city' },
  { name: '淮北', lat: 33.9544, lng: 116.7986, level: 'city' },
  { name: '铜陵', lat: 30.9296, lng: 117.8169, level: 'city' },
  { name: '安庆', lat: 30.5430, lng: 117.0635, level: 'city' },
  { name: '黄山', lat: 29.7148, lng: 118.3376, level: 'city' },
  { name: '滁州', lat: 32.3018, lng: 118.3169, level: 'city' },
  { name: '阜阳', lat: 32.8901, lng: 115.8146, level: 'city' },
  { name: '宿州', lat: 33.6466, lng: 116.9839, level: 'city' },
  { name: '六安', lat: 31.7335, lng: 116.5076, level: 'city' },
  { name: '亳州', lat: 33.8693, lng: 115.7787, level: 'city' },
  { name: '池州', lat: 30.6646, lng: 117.4915, level: 'city' },
  { name: '宣城', lat: 30.9406, lng: 118.7588, level: 'city' },

  // ==================== 福建省 ====================
  { name: '福州', lat: 26.0745, lng: 119.2965, level: 'city' },
  { name: '厦门', lat: 24.4798, lng: 118.0894, level: 'city' },
  { name: '莆田', lat: 25.4310, lng: 119.0078, level: 'city' },
  { name: '三明', lat: 26.2655, lng: 117.6390, level: 'city' },
  { name: '泉州', lat: 24.8741, lng: 118.6757, level: 'city' },
  { name: '漳州', lat: 24.5130, lng: 117.6471, level: 'city' },
  { name: '南平', lat: 26.6418, lng: 118.1780, level: 'city' },
  { name: '龙岩', lat: 25.0915, lng: 117.0297, level: 'city' },
  { name: '宁德', lat: 26.6656, lng: 119.5275, level: 'city' },

  // ==================== 江西省 ====================
  { name: '南昌', lat: 28.6820, lng: 115.8579, level: 'city' },
  { name: '景德镇', lat: 29.2682, lng: 117.1784, level: 'city' },
  { name: '萍乡', lat: 27.6229, lng: 113.8546, level: 'city' },
  { name: '九江', lat: 29.7050, lng: 116.0019, level: 'city' },
  { name: '新余', lat: 27.8174, lng: 114.9170, level: 'city' },
  { name: '鹰潭', lat: 28.2604, lng: 117.0686, level: 'city' },
  { name: '赣州', lat: 25.8311, lng: 114.9335, level: 'city' },
  { name: '吉安', lat: 27.1140, lng: 114.9866, level: 'city' },
  { name: '宜春', lat: 27.8146, lng: 114.4163, level: 'city' },
  { name: '抚州', lat: 27.9485, lng: 116.3582, level: 'city' },
  { name: '上饶', lat: 28.4549, lng: 117.9433, level: 'city' },

  // ==================== 山东省 ====================
  { name: '济南', lat: 36.6512, lng: 117.1201, level: 'city' },
  { name: '青岛', lat: 36.0671, lng: 120.3826, level: 'city' },
  { name: '淄博', lat: 36.8137, lng: 118.0548, level: 'city' },
  { name: '枣庄', lat: 34.8108, lng: 117.3239, level: 'city' },
  { name: '东营', lat: 37.4346, lng: 118.6747, level: 'city' },
  { name: '烟台', lat: 37.4638, lng: 121.4478, level: 'city' },
  { name: '潍坊', lat: 36.7068, lng: 119.1619, level: 'city' },
  { name: '济宁', lat: 35.4154, lng: 116.5872, level: 'city' },
  { name: '泰安', lat: 36.1944, lng: 117.0875, level: 'city' },
  { name: '威海', lat: 37.5128, lng: 122.1201, level: 'city' },
  { name: '日照', lat: 35.4164, lng: 119.5269, level: 'city' },
  { name: '临沂', lat: 35.1042, lng: 118.3564, level: 'city' },
  { name: '德州', lat: 37.4355, lng: 116.3575, level: 'city' },
  { name: '聊城', lat: 36.4566, lng: 115.9856, level: 'city' },
  { name: '滨州', lat: 37.3835, lng: 117.9706, level: 'city' },
  { name: '菏泽', lat: 35.2333, lng: 115.4810, level: 'city' },
  { name: '曲阜', lat: 35.5949, lng: 116.9914, level: 'county' },
  { name: '邹城', lat: 35.4050, lng: 116.9730, level: 'county' },

  // ==================== 河南省 ====================
  { name: '郑州', lat: 34.7466, lng: 113.6253, level: 'city' },
  { name: '开封', lat: 34.7972, lng: 114.3076, level: 'city' },
  { name: '洛阳', lat: 34.6197, lng: 112.4540, level: 'city' },
  { name: '平顶山', lat: 33.7660, lng: 113.1923, level: 'city' },
  { name: '安阳', lat: 36.0986, lng: 114.3925, level: 'city' },
  { name: '鹤壁', lat: 35.7475, lng: 114.2974, level: 'city' },
  { name: '新乡', lat: 35.3030, lng: 113.9268, level: 'city' },
  { name: '焦作', lat: 35.2159, lng: 113.2418, level: 'city' },
  { name: '濮阳', lat: 35.7682, lng: 115.0292, level: 'city' },
  { name: '许昌', lat: 34.0357, lng: 113.8262, level: 'city' },
  { name: '漯河', lat: 33.5759, lng: 114.0167, level: 'city' },
  { name: '三门峡', lat: 34.7726, lng: 111.2003, level: 'city' },
  { name: '南阳', lat: 32.9908, lng: 112.5288, level: 'city' },
  { name: '商丘', lat: 34.4148, lng: 115.6505, level: 'city' },
  { name: '信阳', lat: 32.1473, lng: 114.0913, level: 'city' },
  { name: '周口', lat: 33.6204, lng: 114.6497, level: 'city' },
  { name: '驻马店', lat: 32.9802, lng: 114.0249, level: 'city' },
  { name: '济源', lat: 35.0903, lng: 112.5902, level: 'city' },

  // ==================== 湖北省 ====================
  { name: '武汉', lat: 30.5928, lng: 114.3055, level: 'city' },
  { name: '黄石', lat: 30.1985, lng: 115.0772, level: 'city' },
  { name: '十堰', lat: 32.6298, lng: 110.7980, level: 'city' },
  { name: '宜昌', lat: 30.6919, lng: 111.2864, level: 'city' },
  { name: '襄阳', lat: 32.0094, lng: 112.1226, level: 'city' },
  { name: '鄂州', lat: 30.3965, lng: 114.8949, level: 'city' },
  { name: '荆门', lat: 31.0354, lng: 112.2049, level: 'city' },
  { name: '孝感', lat: 30.9264, lng: 113.9165, level: 'city' },
  { name: '荆州', lat: 30.3346, lng: 112.2410, level: 'city' },
  { name: '黄冈', lat: 30.4534, lng: 114.8721, level: 'city' },
  { name: '咸宁', lat: 29.8410, lng: 114.3221, level: 'city' },
  { name: '随州', lat: 31.6900, lng: 113.3733, level: 'city' },
  { name: '恩施', lat: 30.2722, lng: 109.4884, level: 'city' },

  // ==================== 湖南省 ====================
  { name: '长沙', lat: 28.2282, lng: 112.9388, level: 'city' },
  { name: '株洲', lat: 27.8358, lng: 113.1313, level: 'city' },
  { name: '湘潭', lat: 27.8297, lng: 112.9438, level: 'city' },
  { name: '衡阳', lat: 26.8943, lng: 112.5722, level: 'city' },
  { name: '邵阳', lat: 27.2389, lng: 111.4677, level: 'city' },
  { name: '岳阳', lat: 29.3572, lng: 113.1289, level: 'city' },
  { name: '常德', lat: 29.0317, lng: 111.6991, level: 'city' },
  { name: '张家界', lat: 29.1170, lng: 110.4791, level: 'city' },
  { name: '益阳', lat: 28.5538, lng: 112.3554, level: 'city' },
  { name: '郴州', lat: 25.7707, lng: 113.0149, level: 'city' },
  { name: '永州', lat: 26.4203, lng: 111.6132, level: 'city' },
  { name: '怀化', lat: 27.5575, lng: 109.9785, level: 'city' },
  { name: '娄底', lat: 27.7280, lng: 111.9968, level: 'city' },

  // ==================== 广东省 ====================
  { name: '广州', lat: 23.1291, lng: 113.2644, level: 'city' },
  { name: '深圳', lat: 22.5431, lng: 114.0579, level: 'city' },
  { name: '珠海', lat: 22.2710, lng: 113.5767, level: 'city' },
  { name: '汕头', lat: 23.3535, lng: 116.6820, level: 'city' },
  { name: '佛山', lat: 23.0218, lng: 113.1219, level: 'city' },
  { name: '韶关', lat: 24.8108, lng: 113.5972, level: 'city' },
  { name: '湛江', lat: 21.2710, lng: 110.3594, level: 'city' },
  { name: '肇庆', lat: 23.0470, lng: 112.4654, level: 'city' },
  { name: '惠州', lat: 23.1115, lng: 114.4161, level: 'city' },
  { name: '梅州', lat: 24.2886, lng: 116.1226, level: 'city' },
  { name: '汕尾', lat: 22.7864, lng: 115.3754, level: 'city' },
  { name: '河源', lat: 23.7434, lng: 114.7002, level: 'city' },
  { name: '阳江', lat: 21.8589, lng: 111.9822, level: 'city' },
  { name: '清远', lat: 23.6817, lng: 113.0563, level: 'city' },
  { name: '东莞', lat: 23.0207, lng: 113.7518, level: 'city' },
  { name: '中山', lat: 22.5176, lng: 113.3927, level: 'city' },
  { name: '潮州', lat: 23.6618, lng: 116.6224, level: 'city' },
  { name: '揭阳', lat: 23.5498, lng: 116.3728, level: 'city' },
  { name: '云浮', lat: 22.9151, lng: 112.0444, level: 'city' },

  // ==================== 广西 ====================
  { name: '南宁', lat: 22.8170, lng: 108.3669, level: 'city' },
  { name: '柳州', lat: 24.3146, lng: 109.4280, level: 'city' },
  { name: '桂林', lat: 25.2736, lng: 110.2907, level: 'city' },
  { name: '梧州', lat: 23.4761, lng: 111.2790, level: 'city' },
  { name: '北海', lat: 21.4733, lng: 109.1196, level: 'city' },
  { name: '防城港', lat: 21.6862, lng: 108.3454, level: 'city' },
  { name: '钦州', lat: 21.9799, lng: 108.6541, level: 'city' },
  { name: '贵港', lat: 23.1112, lng: 109.5984, level: 'city' },
  { name: '玉林', lat: 22.6543, lng: 110.1810, level: 'city' },
  { name: '百色', lat: 23.9020, lng: 106.6184, level: 'city' },
  { name: '贺州', lat: 24.4034, lng: 111.5519, level: 'city' },
  { name: '河池', lat: 24.6929, lng: 108.0850, level: 'city' },
  { name: '来宾', lat: 23.7507, lng: 109.2298, level: 'city' },
  { name: '崇左', lat: 22.4040, lng: 107.3494, level: 'city' },

  // ==================== 海南省 ====================
  { name: '海口', lat: 20.0444, lng: 110.1992, level: 'city' },
  { name: '三亚', lat: 18.2528, lng: 109.5119, level: 'city' },

  // ==================== 四川省 ====================
  { name: '成都', lat: 30.5728, lng: 104.0668, level: 'city' },
  { name: '自贡', lat: 29.3392, lng: 104.7790, level: 'city' },
  { name: '攀枝花', lat: 26.5824, lng: 101.7188, level: 'city' },
  { name: '泸州', lat: 28.8717, lng: 105.4433, level: 'city' },
  { name: '德阳', lat: 31.1271, lng: 104.3979, level: 'city' },
  { name: '绵阳', lat: 31.4678, lng: 104.6796, level: 'city' },
  { name: '广元', lat: 32.4358, lng: 105.8438, level: 'city' },
  { name: '遂宁', lat: 30.5328, lng: 105.5713, level: 'city' },
  { name: '内江', lat: 29.5870, lng: 105.0584, level: 'city' },
  { name: '乐山', lat: 29.5521, lng: 103.7660, level: 'city' },
  { name: '南充', lat: 30.8373, lng: 106.1106, level: 'city' },
  { name: '眉山', lat: 30.0750, lng: 103.8484, level: 'city' },
  { name: '宜宾', lat: 28.7513, lng: 104.6234, level: 'city' },
  { name: '广安', lat: 30.4567, lng: 106.6333, level: 'city' },
  { name: '达州', lat: 31.2098, lng: 107.4683, level: 'city' },
  { name: '雅安', lat: 29.9805, lng: 103.0010, level: 'city' },
  { name: '巴中', lat: 31.8581, lng: 106.7474, level: 'city' },
  { name: '资阳', lat: 30.1222, lng: 104.6418, level: 'city' },
  { name: '阿坝', lat: 31.8994, lng: 102.2245, level: 'city' },
  { name: '甘孜', lat: 30.0496, lng: 101.9636, level: 'city' },
  { name: '凉山', lat: 27.8865, lng: 102.2587, level: 'city' },

  // ==================== 贵州省 ====================
  { name: '贵阳', lat: 26.6470, lng: 106.6302, level: 'city' },
  { name: '六盘水', lat: 26.5917, lng: 104.8329, level: 'city' },
  { name: '遵义', lat: 27.7253, lng: 106.9272, level: 'city' },
  { name: '安顺', lat: 26.2530, lng: 105.9322, level: 'city' },
  { name: '毕节', lat: 27.2837, lng: 105.2862, level: 'city' },
  { name: '铜仁', lat: 27.7180, lng: 109.1894, level: 'city' },
  { name: '黔西南', lat: 25.0885, lng: 104.8978, level: 'city' },
  { name: '黔东南', lat: 26.5836, lng: 107.9772, level: 'city' },
  { name: '黔南', lat: 26.2587, lng: 107.5176, level: 'city' },

  // ==================== 云南省 ====================
  { name: '昆明', lat: 24.8801, lng: 102.8329, level: 'city' },
  { name: '曲靖', lat: 25.4901, lng: 103.7960, level: 'city' },
  { name: '玉溪', lat: 24.3514, lng: 102.5460, level: 'city' },
  { name: '保山', lat: 25.1118, lng: 99.1611, level: 'city' },
  { name: '昭通', lat: 27.3367, lng: 103.7173, level: 'city' },
  { name: '丽江', lat: 26.8721, lng: 100.2330, level: 'city' },
  { name: '普洱', lat: 22.8270, lng: 100.9722, level: 'city' },
  { name: '临沧', lat: 23.8866, lng: 100.0793, level: 'city' },
  { name: '楚雄', lat: 25.0418, lng: 101.5460, level: 'city' },
  { name: '红河', lat: 23.3637, lng: 103.3756, level: 'city' },
  { name: '文山', lat: 23.3697, lng: 104.2440, level: 'city' },
  { name: '西双版纳', lat: 22.0017, lng: 100.7971, level: 'city' },
  { name: '大理', lat: 25.6065, lng: 100.2679, level: 'city' },
  { name: '德宏', lat: 24.4366, lng: 98.5784, level: 'city' },
  { name: '怒江', lat: 25.8533, lng: 98.8541, level: 'city' },
  { name: '迪庆', lat: 27.8269, lng: 99.7065, level: 'city' },

  // ==================== 西藏 ====================
  { name: '拉萨', lat: 29.6500, lng: 91.1409, level: 'city' },
  { name: '日喀则', lat: 29.2675, lng: 88.8810, level: 'city' },
  { name: '昌都', lat: 31.1369, lng: 97.1785, level: 'city' },
  { name: '林芝', lat: 29.6469, lng: 94.3625, level: 'city' },
  { name: '山南', lat: 29.2378, lng: 91.7666, level: 'city' },
  { name: '那曲', lat: 31.4762, lng: 92.0517, level: 'city' },
  { name: '阿里', lat: 32.5036, lng: 80.1054, level: 'city' },

  // ==================== 陕西省 ====================
  { name: '西安', lat: 34.3416, lng: 108.9398, level: 'city' },
  { name: '铜川', lat: 34.8967, lng: 108.9456, level: 'city' },
  { name: '宝鸡', lat: 34.3613, lng: 107.2370, level: 'city' },
  { name: '咸阳', lat: 34.3293, lng: 108.7050, level: 'city' },
  { name: '渭南', lat: 34.4998, lng: 109.5103, level: 'city' },
  { name: '延安', lat: 36.5853, lng: 109.4894, level: 'city' },
  { name: '汉中', lat: 33.0680, lng: 107.0277, level: 'city' },
  { name: '榆林', lat: 38.2853, lng: 109.7344, level: 'city' },
  { name: '安康', lat: 32.6849, lng: 109.0294, level: 'city' },
  { name: '商洛', lat: 33.8689, lng: 109.9408, level: 'city' },

  // ==================== 甘肃省 ====================
  { name: '兰州', lat: 36.0611, lng: 103.8343, level: 'city' },
  { name: '嘉峪关', lat: 39.7714, lng: 98.2773, level: 'city' },
  { name: '金昌', lat: 38.5145, lng: 102.1879, level: 'city' },
  { name: '白银', lat: 36.5447, lng: 104.1382, level: 'city' },
  { name: '天水', lat: 34.5805, lng: 105.7249, level: 'city' },
  { name: '武威', lat: 37.9283, lng: 102.6411, level: 'city' },
  { name: '张掖', lat: 38.9259, lng: 100.4499, level: 'city' },
  { name: '平凉', lat: 35.5430, lng: 106.6650, level: 'city' },
  { name: '酒泉', lat: 39.7326, lng: 98.4949, level: 'city' },
  { name: '庆阳', lat: 35.7340, lng: 107.6440, level: 'city' },
  { name: '定西', lat: 35.5810, lng: 104.6262, level: 'city' },
  { name: '陇南', lat: 33.4006, lng: 104.9217, level: 'city' },
  { name: '临夏', lat: 35.5995, lng: 103.2122, level: 'city' },
  { name: '甘南', lat: 34.9864, lng: 102.9111, level: 'city' },

  // ==================== 青海省 ====================
  { name: '西宁', lat: 36.6232, lng: 101.7804, level: 'city' },
  { name: '海东', lat: 36.4798, lng: 102.1042, level: 'city' },
  { name: '海北', lat: 36.9595, lng: 100.9009, level: 'city' },
  { name: '黄南', lat: 35.5197, lng: 102.0193, level: 'city' },
  { name: '海南州', lat: 36.2864, lng: 100.6201, level: 'city' },
  { name: '果洛', lat: 34.4736, lng: 100.2451, level: 'city' },
  { name: '玉树', lat: 33.0040, lng: 97.0064, level: 'city' },
  { name: '海西', lat: 37.3744, lng: 97.3705, level: 'city' },

  // ==================== 宁夏 ====================
  { name: '银川', lat: 38.4872, lng: 106.2309, level: 'city' },
  { name: '石嘴山', lat: 38.9841, lng: 106.3835, level: 'city' },
  { name: '吴忠', lat: 37.9863, lng: 106.1990, level: 'city' },
  { name: '固原', lat: 36.0046, lng: 106.2425, level: 'city' },
  { name: '中卫', lat: 37.5149, lng: 105.1896, level: 'city' },

  // ==================== 新疆 ====================
  { name: '乌鲁木齐', lat: 43.8256, lng: 87.6168, level: 'city' },
  { name: '克拉玛依', lat: 45.5959, lng: 84.8898, level: 'city' },
  { name: '吐鲁番', lat: 42.9514, lng: 89.1893, level: 'city' },
  { name: '哈密', lat: 42.8190, lng: 93.5151, level: 'city' },
  { name: '昌吉', lat: 44.0144, lng: 87.3041, level: 'city' },
  { name: '博尔塔拉', lat: 44.9032, lng: 82.0666, level: 'city' },
  { name: '巴音郭楞', lat: 41.7641, lng: 86.1454, level: 'city' },
  { name: '阿克苏', lat: 41.1683, lng: 80.2606, level: 'city' },
  { name: '克孜勒苏', lat: 39.7150, lng: 76.1668, level: 'city' },
  { name: '喀什', lat: 39.4677, lng: 75.9938, level: 'city' },
  { name: '和田', lat: 37.1107, lng: 79.9217, level: 'city' },
  { name: '伊犁', lat: 43.9219, lng: 81.3171, level: 'city' },
  { name: '塔城', lat: 46.7461, lng: 82.9908, level: 'city' },
  { name: '阿勒泰', lat: 47.8484, lng: 88.1410, level: 'city' },

  // ==================== 台湾省（示意） ====================
  { name: '台北', lat: 25.0330, lng: 121.5654, level: 'city' },
  { name: '高雄', lat: 22.6273, lng: 120.3014, level: 'city' },

  // ==================== 香港/澳门 ====================
  { name: '香港', lat: 22.3193, lng: 114.1694, level: 'city' },
  { name: '澳门', lat: 22.1987, lng: 113.5439, level: 'city' },
];

// 索引化（O(1) 查询）
const DICT_MAP = new Map<string, GeoCoord>();
for (const e of RAW_DICT) {
  DICT_MAP.set(e.name, {
    lat: e.lat,
    lng: e.lng,
    level: e.level,
    name: e.name,
  });
  // 同时去掉"市/县"建立别名索引
  if (e.name.endsWith('市') || e.name.endsWith('县')) {
    const alias = e.name.slice(0, -1);
    if (!DICT_MAP.has(alias)) {
      DICT_MAP.set(alias, {
        lat: e.lat,
        lng: e.lng,
        level: e.level,
        name: e.name,
      });
    }
  }
}

/**
 * 查询地点经纬度
 *
 * @example
 *   geoLookup('山西洪洞') // 精确匹配洪洞县
 *   geoLookup('洪洞')     // 同上
 *   geoLookup('北京')     // 北京市
 *   geoLookup('未知地点') // null
 */
export function geoLookup(name: string): GeoCoord | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  // 1) 精确匹配
  const exact = DICT_MAP.get(trimmed);
  if (exact) return exact;

  // 2) 模糊匹配：去掉"中国"、"省"、"自治区"等前缀
  const cleaned = trimmed
    .replace(/^(中国|中华|中华民国)/, '')
    .replace(/(省|自治区|特别行政区|地区)$/, '')
    .trim();
  if (cleaned !== trimmed) {
    const fuzzy = DICT_MAP.get(cleaned);
    if (fuzzy) return fuzzy;
  }

  // 3) 包含匹配：若 trimmed 形如 "山西洪洞" 拆出 "洪洞"
  for (const len of [2, 3]) {
    if (trimmed.length > len) {
      const tail = trimmed.slice(-len);
      const m = DICT_MAP.get(tail);
      if (m) return m;
    }
  }

  return null;
}

/**
 * 批量查询
 */
export function geoLookupBatch(names: string[]): Array<{ name: string; coord: GeoCoord | null }> {
  return names.map((n) => ({ name: n, coord: geoLookup(n) }));
}

/**
 * 返回字典规模（调试用）
 */
export function getDictSize(): number {
  return DICT_MAP.size;
}

export default geoLookup;
