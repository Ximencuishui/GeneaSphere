const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main(){
const users=await prisma.user.findMany({take:2});
if(users.length<2){
console.log('Need at least 2 users, creating...');
await prisma.user.create({data:{phone:'13800138001',password_hash:'test'}});
await prisma.user.create({data:{phone:'13800138002',password_hash:'test'}});
}
const [user1,user2]=await prisma.user.findMany({take:2});
const clans=await prisma.clan.findMany({take:2});
if(clans.length<2){
console.log('Creating clans...');
await prisma.clan.create({data:{name:'陈氏家族',admin_user_id:user1.id}});
await prisma.clan.create({data:{name:'李氏家族',admin_user_id:user2.id}});
}
const [clan1,clan2]=await prisma.clan.findMany({take:2});
const medias=[
{clan_id:clan1.id,uploader_id:user1.id,file_url:'/media/photo_family_1990.jpg',taken_year:1990,taken_location:'北京',description:'陈氏家族合影1990年'},
{clan_id:clan2.id,uploader_id:user2.id,file_url:'/media/photo_wedding_1992.jpg',taken_year:1992,taken_location:'北京',description:'李氏婚礼照片1992年'},
{clan_id:clan1.id,uploader_id:user1.id,file_url:'/media/photo_family_1990_shanghai.jpg',taken_year:1990,taken_location:'上海',description:'陈氏家族上海合影1990年'},
{clan_id:clan2.id,uploader_id:user2.id,file_url:'/media/photo_gathering_1989.jpg',taken_year:1989,taken_location:'广州',description:'李氏家族聚会1989年'},
{clan_id:clan2.id,uploader_id:user2.id,file_url:'/media/photo_outdoor_1991.jpg',taken_year:1991,taken_location:'北京',description:'李氏户外合影1991年'},
];
for(const m of medias){
await prisma.mediaArchive.create({data:m});
console.log('Created:',m.file_url);
}
console.log('Done!');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.\())