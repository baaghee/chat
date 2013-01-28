var res = {};
db.pics.find({}).forEach(function(e){
	if(!e.name) return;
	res[e.name] = res[e.name] ? res[e.name] + 1 : 1;
});
var total = 0;
for(var i in res){
	if(res[i] > 1) print(i);
	total++;
}

print(total);
