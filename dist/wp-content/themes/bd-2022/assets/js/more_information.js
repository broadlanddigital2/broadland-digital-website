var about = document.getElementById("about");
var faqs = document.getElementById('faqs');
var howTo = document.getElementById('how-to');

var aboutContent = document.getElementById("about-content");
var faqsContent  = document.getElementById('faqs-content');
var howToContent  = document.getElementById('how-to-content');

if (about) {
    about.addEventListener("click",function(e){
		about.classList.add('active');
		faqs.classList.remove('active');
		howTo.classList.remove('active');

        aboutContent.classList.add('active');
        faqsContent.classList.remove('active');
        howToContent.classList.remove('active');
    },false);
}

if (faqs) {
    faqs.addEventListener("click",function(e){
		faqs.classList.add('active');
		about.classList.remove('active');
		howTo.classList.remove('active');

        aboutContent.classList.remove('active');
        faqsContent.classList.add('active');
        howToContent.classList.remove('active');
    },false);
}

if (howTo) {
    howTo.addEventListener("click",function(e){
		howTo.classList.add('active');
		faqs.classList.remove('active');
		about.classList.remove('active');

        aboutContent.classList.remove('active');
        faqsContent.classList.remove('active');
        howToContent.classList.add('active');
    },false);
}

// masonry

var masonry =  document.getElementById('masonry');

let mainId = 'masonry';
let itemIdentifier = '.masonry img';

document.addEventListener('DOMContentLoaded', function(e) {
    if (masonry) {
        // Programmatically get the column width
        let item = document.querySelector(itemIdentifier);
        let parentWidth = item.parentNode.getBoundingClientRect().width;
        let itemWidth = item.getBoundingClientRect().width + parseFloat(getComputedStyle(item).marginLeft) + parseFloat(getComputedStyle(item).marginRight);
        let columnWidth = Math.round((1 / (itemWidth / parentWidth)));

        // We need this line since JS nodes are dumb
        let arrayOfItems = Array.prototype.slice.call( document.querySelectorAll(itemIdentifier) );
        let trackHeights = {};
        arrayOfItems.forEach(function(item) {
            // Get index of item
            let thisIndex = arrayOfItems.indexOf(item);
            // Get column this and set width
            let thisColumn = thisIndex % columnWidth;
            if(typeof trackHeights[thisColumn] == "undefined") {
                trackHeights[thisColumn] = 0;
            }
            trackHeights[thisColumn] += item.getBoundingClientRect().height + parseFloat(getComputedStyle(item).marginBottom);
            // If the item has an item above it, then move it to fill the gap
            if(thisIndex - columnWidth >= 0) {
                let getItemAbove = document.querySelector(`${itemIdentifier}:nth-of-type(${thisIndex - columnWidth + 1})`);
                let previousBottom = getItemAbove.getBoundingClientRect().bottom;
                let currentTop = item.getBoundingClientRect().top - parseFloat(getComputedStyle(item).marginBottom);
                item.style.top = `-${currentTop - previousBottom}px`;
            }
        });
        let max = Math.max(...Object.values(trackHeights));
        document.getElementById(mainId).style.height = `${max}px`;
    }
});