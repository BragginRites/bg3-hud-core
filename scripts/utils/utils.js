export const BG3UTILS = {
    getItem: async function(item, actor) {
        if(!item) return;
        if(item.uuid) return await fromUuid(item.uuid);
        else return item;
    },
    check2Handed: function(cell) {
        return !!cell.item?.labels?.properties?.find(p => p.abbr === 'two');
    },
    firstUpper: function(string) {
        if (!string.length) return string;
        
        return string[0].toUpperCase() + string.substr(1);
    },
    replacewords: function(text, words = {}){
        let localtext = text;
        
        for (let word of Object.keys(words)) {
            localtext = localtext.replace("{" + word + "}", words[word]);
        }
            
        return localtext;
    }
}